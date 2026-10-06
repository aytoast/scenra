#!/usr/bin/env node
import path from "node:path";
import {
  booleanOption, downloadFile, ensureDir, fetchRead, isMain, isUrl, loadDotEnv, one, parseArgs,
  pathExists, readImageSource, readJson, requireEnv, updateMetadata, writeJson
} from "./common.mjs";
import { artifactPath, buildRequestSummary, requestPath } from "./request-metadata.mjs";

export const TRIPO_BASE = "https://openapi.tripo3d.ai/v3";
export const TRIPO_3D_PROVIDER = "tripo";
export const DEFAULT_TRIPO_MODEL = "v3.1-20260211";
export const DEFAULT_TRIPO_FACE_LIMIT = 50000;

async function tripoRequest(route, options = {}) {
  const key = await requireEnv("TRIPO_API_KEY");
  const request = options.method && options.method !== 'GET' ? fetch : fetchRead;
  const response = await request(`${TRIPO_BASE}${route}`, {
    ...options, headers: { Authorization: `Bearer ${key}`, ...options.headers },
    signal: AbortSignal.timeout(60000)
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.code !== 0) {
    const message = body?.message || body?.error_message || "Request rejected.";
    const error = new Error(`Tripo request failed (${response.status}, code ${body?.code ?? "unknown"}): ${message}`);
    error.rejected = Boolean(body) && response.status < 500;
    throw error;
  }
  return body.data;
}

export function buildTripoInput(options, input) {
  const model = options.modelVersion || process.env.TRIPO_MODEL || DEFAULT_TRIPO_MODEL;
  const faceLimit = Number(options.faceLimit ?? DEFAULT_TRIPO_FACE_LIMIT);
  const smartLowPoly = booleanOption(options.smartLowPoly);
  const texture = booleanOption(options.texture, true);
  const pbr = booleanOption(options.enablePbr, texture);
  const maxFaces = model.startsWith("v2.5") ? 500000 : model.startsWith("v3.0") ? 1000000 : 1500000;
  if (!Number.isInteger(faceLimit) || faceLimit < 500 || faceLimit > (smartLowPoly ? 20000 : maxFaces)) {
    throw new Error(`Tripo face-limit must be an integer between 500 and ${smartLowPoly ? 20000 : maxFaces}.`);
  }
  if (!texture && pbr) throw new Error("PBR requires texture=true. Set --enable-pbr false for geometry-only models.");
  const textureQuality = options.textureQuality || "standard";
  if (!["standard", "detailed", "extreme"].includes(textureQuality)) throw new Error("Tripo texture-quality must be standard, detailed, or extreme.");
  if (model.startsWith("v2.5") && (smartLowPoly || options.textureQuality)) {
    throw new Error("smart-low-poly and texture-quality require Tripo v3.0 or newer.");
  }
  return { input, model, face_limit: faceLimit, texture, pbr,
    ...(!model.startsWith("v2.5") ? { smart_low_poly: smartLowPoly, texture_quality: textureQuality } : {}) };
}

export async function runTripo3D(options) {
  await loadDotEnv();
  const { image, outputDir, metadata = {}, onSubmit } = options;
  if (!image || !outputDir) throw new Error("Tripo generation requires image and outputDir.");
  const metadataPath = options.metadataPath || requestPath(outputDir, 0, "tripo", "model");
  await requireEnv("TRIPO_API_KEY");
  // Validate options before uploading or submitting.
  let input = buildTripoInput(options, image);
  await ensureDir(outputDir);
  if (await pathExists(metadataPath)) {
    const existing = await readJson(metadataPath);
    if (existing.provider === "tripo" && existing.request_id) {
      return resumeTripo3D({ path: metadataPath, data: existing }, options);
    }
    throw new Error("Model request already exists without a resumable Tripo task ID. Check provider usage, then regenerate at a new index.");
  }
  if (!isUrl(image)) {
    const source = await readImageSource(image, 20 * 1024 * 1024);
    if (!["image/png", "image/jpeg"].includes(source.type)) throw new Error("Tripo uploads require PNG or JPEG. Convert WebP before uploading or use a public image URL.");
    const form = new FormData();
    form.append("file", source.blob, source.name);
    const uploaded = await tripoRequest("/files", { method: "POST", body: form });
    if (!uploaded?.file_token) throw new Error("Tripo upload did not return file_token.");
    input = { ...input, input: uploaded.file_token };
  }
  const pending = {
    ...metadata, kind: "3d", provider: "tripo", provider_slug: "tripo",
    endpoint: `${TRIPO_BASE}/generation/image-to-model`, status: "submitting",
    submitted_at: new Date().toISOString(), input_files: [image], input
  };
  await writeJson(metadataPath, pending);
  let submitted;
  try {
    submitted = await tripoRequest("/generation/image-to-model", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input)
    });
  } catch (error) {
    await updateMetadata(metadataPath, { status: error.rejected ? "failed" : "unknown", error: error.message });
    throw error;
  }
  if (!submitted?.task_id) {
    await updateMetadata(metadataPath, { status: "unknown", error: "Submit response did not include task_id." });
    throw new Error("Tripo submit response did not include task_id. Check provider usage before regenerating.");
  }
  pending.request_id = submitted.task_id;
  pending.status = "submitted";
  await updateMetadata(metadataPath, pending);
  if (onSubmit) await onSubmit(pending);
  return resumeTripo3D({ path: metadataPath, data: pending }, options);
}

export async function resumeTripo3D(request, options) {
  const { outputDir, pollIntervalMs = 5000, pollTimeoutMs = 1800000, onStatus } = options;
  if (request.data.provider !== "tripo" || !request.data.request_id) {
    throw new Error("Previous 3D provider was removed. Use --regenerate to start a new Tripo generation.");
  }
  const deadline = Date.now() + pollTimeoutMs;
  let task;
  while (true) {
    task = await tripoRequest(`/tasks/${encodeURIComponent(request.data.request_id)}`);
    const status = String(task?.status || "unknown").toLowerCase();
    const patch = { status, progress: task?.progress, result: task, error: null };
    if (["failed", "cancelled", "canceled", "banned", "expired"].includes(status)) {
      patch.error = task.error_message || `Tripo task ${status}.`;
      await updateMetadata(request.path, patch);
      throw new Error(patch.error);
    }
    await updateMetadata(request.path, patch);
    if (onStatus) await onStatus(patch);
    if (status === "success") break;
    if (Date.now() >= deadline) throw new Error("Tripo polling timed out. Run the same command to resume its existing task.");
    await new Promise((resolve) => setTimeout(resolve, Math.min(pollIntervalMs, Math.max(0, deadline - Date.now()))));
  }
  if (!task.output?.model_url) throw new Error("Tripo task did not return output.model_url.");
  await ensureDir(outputDir);
  const downloaded = [];
  for (const [label, url, fallback] of [
    ["model", task.output.model_url, ".glb"],
    ["thumbnail", task.output.rendered_image_url, ".png"]
  ]) {
    if (!url) continue;
    const extension = label === "model" ? ".glb" : path.extname(new URL(url).pathname) || fallback;
    const filePath = artifactPath(outputDir, request.data.index ?? 0, `tripo-${label}`, extension);
    // Task queries refresh signed URLs; download immediately without submitting another generation.
    await downloadFile(url, filePath);
    downloaded.push({ label, path: filePath, source: { url, content_type: label === "model" ? "model/gltf-binary" : `image/${extension.slice(1)}` } });
  }
  const summary = buildRequestSummary({
    kind: "3d", provider: "tripo", endpoint: `${TRIPO_BASE}/generation/image-to-model`,
    metadata: { index: request.data.index, provider_slug: "tripo", input: request.data.input },
    requestId: request.data.request_id, submittedAt: request.data.submitted_at,
    inputFiles: request.data.input_files, outputFiles: downloaded.map((file) => file.path),
    downloadedFiles: downloaded, result: task
  });
  await writeJson(request.path, summary);
  return summary;
}

if (isMain(import.meta.url)) {
  const { flags } = parseArgs();
  runTripo3D({
    image: one(flags, "image"), outputDir: one(flags, "output-dir"),
    modelVersion: one(flags, "model-version"), faceLimit: one(flags, "face-limit"),
    enablePbr: one(flags, "enable-pbr"), texture: one(flags, "texture"),
    smartLowPoly: one(flags, "smart-low-poly"), textureQuality: one(flags, "texture-quality")
  }).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error.message); process.exit(1); });
}
