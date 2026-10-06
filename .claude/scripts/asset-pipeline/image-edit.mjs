#!/usr/bin/env node
import { runOpenAIImageEdit } from "./openai-image-edit.mjs";
import { isMain, loadDotEnv, many, one, parseArgs } from "./common.mjs";

export function resolveImageEditProvider(provider = "gpt-image-2") {
  if (!["gpt-image-2", "openai"].includes(provider)) {
    throw new Error(`Unsupported image edit provider "${provider}". Use gpt-image-2 or openai.`);
  }
  return "gpt-image-2";
}

export async function runImageEdit(options) {
  await loadDotEnv();
  resolveImageEditProvider(options.provider || process.env.ASSET_IMAGE_EDIT_PROVIDER || "gpt-image-2");
  return runOpenAIImageEdit({ ...options, imageSize: options.imageSize || (options.aspectRatio === "1:1" ? "1024x1024" : "auto") });
}

if (isMain(import.meta.url)) {
  const { flags } = parseArgs();
  runImageEdit({
    provider: one(flags, "provider"), prompt: one(flags, "prompt"),
    images: [...many(flags, "image"), ...many(flags, "input-image")], outputDir: one(flags, "output-dir"),
    numImages: one(flags, "num-images", 1), outputFormat: one(flags, "format", "png"),
    quality: one(flags, "quality", "medium"), imageSize: one(flags, "image-size", "auto"), maskImage: one(flags, "mask-image")
  }).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error.message); process.exit(1); });
}
