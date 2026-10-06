#!/usr/bin/env node
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
export function isMain(url) {
  return Boolean(process.argv[1]) && url === pathToFileURL(path.resolve(process.argv[1])).href;
}

let envLoaded = false;

export async function loadDotEnv(envPath = path.join(REPO_ROOT, ".env")) {
  if (envLoaded) return;
  envLoaded = true;

  let contents;
  try {
    contents = await readFile(envPath, "utf8");
  } catch {
    return;
  }

  for (const rawLine of contents.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export async function requireEnv(name) {
  await loadDotEnv();
  const value = process.env[name];
  if (!value?.trim() || /^(?:your_.*_key_here|changeme|CHANGE_ME|TODO|todo)$/.test(value)) {
    throw new Error(`${name} is not set. Add it to .env before running this script.`);
  }
  return value;
}

export function parseArgs(argv = process.argv.slice(2)) {
  const flags = {};
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    const value = next === undefined || next.startsWith("--") ? true : next;
    if (value !== true) index += 1;

    if (flags[key] === undefined) {
      flags[key] = value;
    } else if (Array.isArray(flags[key])) {
      flags[key].push(value);
    } else {
      flags[key] = [flags[key], value];
    }
  }

  return { flags, positionals };
}

export function one(flags, key, fallback = undefined) {
  const value = flags[key];
  if (Array.isArray(value)) return value.at(-1);
  return value ?? fallback;
}

export function many(flags, key) {
  const value = flags[key];
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

export async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readJson(filePath) {
  const value = JSON.parse(await readFile(filePath, "utf8"));
  return isRequestMetadataPath(filePath) ? stripBase64(value) : value;
}

function isRequestMetadataPath(filePath) {
  return /-request\.json$/i.test(path.basename(filePath || ""));
}

export async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  const output = isRequestMetadataPath(filePath) ? stripBase64(value) : value;
  await writeAtomic(filePath, `${JSON.stringify(output, null, 2)}\n`);
}

export async function writeAtomic(filePath, value) {
  await ensureDir(path.dirname(filePath));
  const temporaryPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}-${randomUUID()}.tmp`);
  try {
    await writeFile(temporaryPath, value);
    await rename(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function isUrl(value) {
  return /^https?:\/\//i.test(value);
}

export function isDataUri(value) {
  return /^data:/i.test(value);
}

export function inferMime(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const mimes = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".heic": "image/heic",
    ".heif": "image/heif",
    ".glb": "model/gltf-binary",
    ".obj": "model/obj",
    ".mtl": "model/mtl",
    ".fbx": "application/octet-stream",
    ".usdz": "model/vnd.usdz+zip"
  };
  return mimes[extension] ?? "application/octet-stream";
}

export async function fileToDataUri(filePath) {
  const data = await readFile(filePath);
  return `data:${inferMime(filePath)};base64,${data.toString("base64")}`;
}

export async function toModelInputUrl(value) {
  if (isUrl(value) || isDataUri(value)) return value;
  if (!(await pathExists(value))) {
    throw new Error(`Input file does not exist: ${value}`);
  }
  return fileToDataUri(value);
}

// Only reads can retry automatically. Paid submissions remain single-attempt.
export async function fetchRead(url, options = {}, { attempts = 4, delayMs = 1000 } = {}) {
  if (options.method && !['GET', 'HEAD'].includes(options.method.toUpperCase())) throw new Error('fetchRead supports GET and HEAD only.');
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(60000) });
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === attempts - 1) return response;
      await response.body?.cancel();
    } catch (error) { if (attempt === attempts - 1 || options.signal?.aborted) throw error; }
    await new Promise((resolve) => setTimeout(resolve, delayMs * 2 ** attempt));
  }
}

export async function downloadFile(url, outputPath) {
  await ensureDir(path.dirname(outputPath));

  if (isDataUri(url)) {
    const match = url.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
    if (!match) throw new Error("Invalid data URI");
    const body = decodeURIComponent(match[3]);
    const buffer = match[2] ? Buffer.from(body, "base64") : Buffer.from(body);
    await writeAtomic(outputPath, buffer);
    return outputPath;
  }

  const response = await fetchRead(url);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}) for ${url}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeAtomic(outputPath, buffer);
  return outputPath;
}

export function extensionForFile(file, fallback = ".bin") {
  if (file.file_name) {
    const extension = path.extname(file.file_name);
    if (extension) return extension;
  }

  const mime = file.content_type;
  const extensions = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "model/gltf-binary": ".glb",
    "model/obj": ".obj",
    "model/mtl": ".mtl"
  };
  return extensions[mime] ?? fallback;
}

export function safeFileName(value) {
  return String(value)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function collectRemoteFiles(value, label = "file", collected = [], seen = new Set()) {
  if (!value) return collected;

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectRemoteFiles(item, `${label}-${index + 1}`, collected, seen));
    return collected;
  }

  if (typeof value === "object") {
    if (typeof value.url === "string" && !seen.has(value.url)) {
      seen.add(value.url);
      collected.push({ label, file: value });
      return collected;
    }

    for (const [key, child] of Object.entries(value)) {
      collectRemoteFiles(child, key, collected, seen);
    }
  }

  return collected;
}

export async function downloadRemoteFiles(result, outputDir, prefix = "file") {
  const downloaded = [];
  const remoteFiles = collectRemoteFiles(result);

  for (const { label, file } of remoteFiles) {
    const fallbackName = `${prefix}-${safeFileName(label)}${extensionForFile(file)}`;
    const fileName = safeFileName(file.file_name || fallbackName);
    const outputPath = path.join(outputDir, fileName);
    await downloadFile(file.url, outputPath);
    downloaded.push({
      label,
      path: outputPath,
      source: file
    });
  }

  return downloaded;
}

function isBase64Field(key) {
  return /base64|b64/i.test(String(key || ""));
}

export function stripBase64(value, key = "") {
  if (typeof value === "string") {
    if (isDataUri(value) || isBase64Field(key)) return "[stripped]";
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => stripBase64(item, key));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, child]) => [
        childKey,
        stripBase64(child, childKey)
      ])
    );
  }

  return value;
}

export const sanitizeForMetadata = stripBase64;

export async function updateMetadata(metadataPath, patch) {
  if (!metadataPath) return;
  const previous = (await pathExists(metadataPath)) ? await readJson(metadataPath) : {};
  await writeJson(metadataPath, { schema_version: 1, ...previous, ...patch, updated_at: new Date().toISOString() });
}

export function booleanOption(value, fallback = false) {
  if (value === undefined) return fallback;
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  throw new Error("Boolean options must be true or false.");
}

export async function readImageSource(source, maxBytes = 50 * 1024 * 1024) {
  let bytes, type, name;
  if (isDataUri(source)) {
    const match = source.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
    if (!match) throw new Error("Image data URI must contain base64 image data.");
    type = match[1]; bytes = Buffer.from(match[2], "base64"); name = "image";
  } else if (isUrl(source)) {
    const response = await fetch(source, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`Input image download failed (${response.status}).`);
    type = response.headers.get("content-type")?.split(";")[0];
    name = path.basename(new URL(source).pathname);
    bytes = Buffer.from(await response.arrayBuffer());
    if (!type?.startsWith("image/")) type = inferMime(name);
  } else {
    bytes = await readFile(source); type = inferMime(source); name = path.basename(source);
  }
  if (!bytes.length || bytes.length > maxBytes) throw new Error(`Input image must be nonempty and at most ${maxBytes / 1024 / 1024} MB.`);
  if (!["image/png", "image/jpeg", "image/webp"].includes(type)) throw new Error("Input image must be PNG, JPEG, or WebP. Convert other formats before generation.");
  if (!path.extname(name)) name += extensionForFile({ content_type: type });
  return { blob: new Blob([bytes], { type }), name, type };
}

