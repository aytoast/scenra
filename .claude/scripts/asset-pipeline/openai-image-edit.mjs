#!/usr/bin/env node
import {
  ensureDir, isMain, loadDotEnv, many, one, parseArgs, pathExists,
  readImageSource, readJson, requireEnv, stripBase64, updateMetadata, writeAtomic, writeJson
} from "./common.mjs";
import { artifactPath, buildRequestSummary, requestPath } from "./request-metadata.mjs";

export const OPENAI_EDIT_ENDPOINT = "https://api.openai.com/v1/images/edits";
export const DEFAULT_IMAGE_MODEL = "gpt-image-2";

// Multipart image inputs need only image request access, not Files, Models, or Responses access.
export async function runOpenAIImageEdit(options) {
  await loadDotEnv();
  const {
    prompt, images, outputDir, numImages = 1, outputFormat = "png",
    quality = "medium", imageSize = "auto", maskImage, metadata = {},
    model = process.env.OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
    timeoutMs = 600000, onSubmit
  } = options;
  if (!prompt || !images?.length || !outputDir) throw new Error("Image editing requires prompt, input images, and outputDir.");
  const metadataPath = options.metadataPath || requestPath(outputDir, 0, "image-edit");
  if (await pathExists(metadataPath)) {
    return resumeOpenAIEdit({ path: metadataPath, data: await readJson(metadataPath) });
  }
  if (!/^gpt-image-/.test(model)) throw new Error("OPENAI_IMAGE_MODEL must name a GPT Image model.");
  const count = Number(numImages);
  if (!Number.isInteger(count) || count < 1 || count > 10) throw new Error("num-images must be between 1 and 10.");
  if (!["png", "jpeg", "webp"].includes(outputFormat)) throw new Error("Output format must be png, jpeg, or webp.");
  if (!["auto", "low", "medium", "high"].includes(quality)) throw new Error("Image quality must be auto, low, medium, or high.");
  if (imageSize !== "auto" && !/^\d+x\d+$/.test(imageSize)) throw new Error("Image size must be auto or WIDTHxHEIGHT.");

  const apiKey = await requireEnv("OPENAI_API_KEY");
  const form = new FormData();
  for (const [key, value] of Object.entries({ model, prompt, n: count, quality, size: imageSize, output_format: outputFormat })) form.append(key, String(value));
  for (const source of images) {
    const image = await readImageSource(source);
    form.append("image[]", image.blob, image.name);
  }
  if (maskImage) {
    const mask = await readImageSource(maskImage);
    if (mask.type !== "image/png") throw new Error("Image edit mask must be PNG.");
    form.append("mask", mask.blob, mask.name);
  }
  await ensureDir(outputDir);
  const submittedAt = new Date().toISOString();
  const pending = {
    ...metadata, kind: "2d", provider: "openai", provider_alias: "gpt-image-2",
    endpoint: OPENAI_EDIT_ENDPOINT, model, status: "submitting", submitted_at: submittedAt,
    prompt, input_files: images, mask_image: maskImage, quality, size: imageSize,
    output_format: outputFormat, num_images: count
  };
  await updateMetadata(metadataPath, pending);
  if (onSubmit) await onSubmit(pending);
  let response, result;
  try {
    response = await fetch(OPENAI_EDIT_ENDPOINT, {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form,
      signal: AbortSignal.timeout(timeoutMs)
    });
    result = await response.json();
  } catch (error) {
    // A timed-out synchronous request may have been billed. Never resubmit automatically.
    await updateMetadata(metadataPath, { status: "unknown", error: "Image response was interrupted. Check provider usage before explicitly regenerating." });
    throw new Error("OpenAI image response was interrupted. Check provider usage before explicitly regenerating.", { cause: error });
  }
  const requestId = response.headers.get("x-request-id") || undefined;
  if (!response.ok) {
    const message = result.error?.message || "Image edit request rejected.";
    await updateMetadata(metadataPath, { status: response.status >= 500 ? "unknown" : "failed", request_id: requestId, error: message });
    throw new Error(`OpenAI image edit failed (${response.status}): ${message}`);
  }
  if (!result.data?.length || result.data.some((item) => !item.b64_json)) {
    await updateMetadata(metadataPath, { status: "unknown", request_id: requestId, error: "Image result did not include base64 output." });
    throw new Error("OpenAI image result did not include base64 output. Check provider usage before regenerating.");
  }
  await updateMetadata(metadataPath, { status: "saving", request_id: requestId, result: stripBase64(result) });
  const downloaded = [];
  for (const [offset, item] of result.data.entries()) {
    const slug = metadata.output_slug || "image-edit";
    const filePath = artifactPath(outputDir, metadata.index ?? 0, offset ? `${slug}-${offset + 1}` : slug, `.${outputFormat}`);
    await writeAtomic(filePath, Buffer.from(item.b64_json, "base64"));
    downloaded.push({ label: `image-${offset + 1}`, path: filePath, source: { content_type: `image/${outputFormat}` } });
    await updateMetadata(metadataPath, { output_files: downloaded.map((file) => file.path), downloaded_files: downloaded });
  }
  const summary = buildRequestSummary({
    kind: "2d", provider: "openai", endpoint: OPENAI_EDIT_ENDPOINT, metadata,
    requestId, submittedAt, prompt, inputFiles: images,
    outputFiles: downloaded.map((file) => file.path), downloadedFiles: downloaded, result,
    extra: { model, provider_alias: "gpt-image-2", mask_image: maskImage, num_images: count }
  });
  await writeJson(metadataPath, summary);
  return summary;
}

export async function resumeOpenAIEdit(request) {
  if (request.data.provider !== "openai") throw new Error("Previous image provider was removed. Use --regenerate or --regenerate-reference to start a new OpenAI edit.");
  const files = request.data.downloaded_files || [];
  const expected = request.data.num_images || 1;
  if (files.length === expected && (await Promise.all(files.map((file) => pathExists(file.path)))).every(Boolean)) {
    await updateMetadata(request.path, { status: "completed", error: null });
    return { ...request.data, status: "completed", error: null };
  }
  throw new Error("OpenAI edits are synchronous and cannot be polled after interruption. Check provider usage, then use --regenerate or --regenerate-reference explicitly.");
}

if (isMain(import.meta.url)) {
  const { flags } = parseArgs();
  runOpenAIImageEdit({
    images: many(flags, "image"), prompt: one(flags, "prompt"), outputDir: one(flags, "output-dir"),
    numImages: one(flags, "num-images", 1), outputFormat: one(flags, "format", "png"),
    quality: one(flags, "quality", "medium"), imageSize: one(flags, "image-size", "auto"), maskImage: one(flags, "mask-image")
  }).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error.message); process.exit(1); });
}
