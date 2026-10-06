#!/usr/bin/env node
import { runImageEdit } from "../asset-pipeline/image-edit.mjs";
import { resumeOpenAIEdit } from "../asset-pipeline/openai-image-edit.mjs";
import { booleanOption, ensureDir, isMain, many, one, parseArgs, readJson, slugify, writeJson } from "../asset-pipeline/common.mjs";
import { nextIndex, requestMetadataFiles, requestPath } from "../asset-pipeline/request-metadata.mjs";

export async function generateEdit(options) {
  const { images, prompt, outputDir, outputSlug, role = "image-edit", regenerate = false } = options;
  if (!images?.length) throw new Error("At least one --image is required.");
  if (!prompt) throw new Error("--prompt is required.");
  if (!outputDir) throw new Error("--output-dir is required.");
  const slug = slugify(outputSlug || role);
  if (!slug) throw new Error("Output slug is required.");
  await ensureDir(outputDir);
  const active = regenerate ? undefined : (await requestMetadataFiles(outputDir, { slug })).find((request) =>
    request.data.endpoint && !["completed", "failed", "cancelled", "canceled"].includes(String(request.data.status).toLowerCase())
  );
  const index = active?.index ?? await nextIndex(outputDir);
  const metadataPath = active?.path ?? requestPath(outputDir, index, slug);
  const edit = active
    ? await resumeOpenAIEdit(active)
    : await runImageEdit({ ...options, metadataPath, metadata: { index, role, output_slug: slug } });
  const files = edit.downloaded_files || [];
  if (!files.length) throw new Error("Image edit did not return image output.");
  await writeJson(metadataPath, { ...await readJson(metadataPath), role, output_slug: slug });
  return {
    schema_version: 1, role, prompt, input_images: images,
    output_image: files[0].path, output_images: files.map((file) => file.path),
    request_metadata: metadataPath
  };
}

if (isMain(import.meta.url)) {
  const { flags } = parseArgs();
  generateEdit({
    images: [...many(flags, "image"), ...many(flags, "input-image")], prompt: one(flags, "prompt"),
    outputDir: one(flags, "output-dir"), outputSlug: one(flags, "output-slug") || one(flags, "slug"),
    role: one(flags, "role", "image-edit"), provider: one(flags, "provider") || one(flags, "image-edit-provider"),
    numImages: one(flags, "num-images", 1), outputFormat: one(flags, "format", "png"),
    quality: one(flags, "quality", "medium"), imageSize: one(flags, "image-size", "auto"),
    maskImage: one(flags, "mask-image"), regenerate: booleanOption(one(flags, "regenerate"))
  }).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error.message); process.exit(1); });
}
