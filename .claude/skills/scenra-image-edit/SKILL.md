---
name: scenra-image-edit
description: Generate one image edit from explicit input images and a prompt. Use for source cleanup, clean plates, object removal, or other OpenAI image edits.
argument-hint: [image path] [prompt] [optional output dir, role, output slug]
allowed-tools: Read Write Glob Bash(ls *) Bash(node .claude/scripts/project/ensure-local-assets.mjs *) Bash(node .claude/scripts/image-edit/generate-edit.mjs *)
context: fork
agent: scenra-image-edit
---

Create one edited image.

## Instructions

- Require at least one input image and one edit prompt.
- Use `ls -a` before reading generated state.
- Use the output directory, role, and output slug provided by the caller.
- Use `--role` for semantics such as `plate`, `object-mask`, or `image-edit`.
- Use `--output-slug` for the visible indexed artifact name, such as `<source-slug>-plate`.

Run:

```bash
node .claude/scripts/image-edit/generate-edit.mjs \
  --image "<input image path>" \
  --prompt "<edit prompt>" \
  --output-dir "<output directory>" \
  --role "<role>" \
  --output-slug "<output slug>"
```

Image editing uses OpenAI `gpt-image-2` directly. Supported aliases: `--provider gpt-image-2|openai`. Optional controls: `--quality auto|low|medium|high`, `--image-size auto|WIDTHxHEIGHT`, `--mask-image <PNG>`, and `--num-images <1-10>`.

OpenAI image edits return base64 data that is saved locally; base64 is omitted from request metadata. Interrupted responses cannot be polled or recovered from URLs. Check provider usage and ask before explicitly rerunning with `--regenerate`.

Final response: report input images, output image, request metadata, role, and prompt used.

