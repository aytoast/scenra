import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { runOpenAIImageEdit, OPENAI_EDIT_ENDPOINT } from "./openai-image-edit.mjs";
import { buildTripoInput, runTripo3D, TRIPO_BASE } from "./tripo-3d.mjs";
import { generateEdit } from "../image-edit/generate-edit.mjs";
import { generateSingleObject } from "./generate-single-asset.mjs";
import { fetchRead, loadDotEnv, readJson, REPO_ROOT, writeJson } from "./common.mjs";
import { generateWorld } from '../world/generate-world.mjs';
import { requestPath } from "./request-metadata.mjs";

process.env.OPENAI_API_KEY = "test-image-key";
process.env.TRIPO_API_KEY = "test-tripo-key";
process.env.WORLD_LABS_API_KEY = "test-world-key";
delete process.env.OPENAI_IMAGE_MODEL;
delete process.env.TRIPO_MODEL;
await loadDotEnv();
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64");
const glb = Buffer.from("glTF-test-output");
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "x-request-id": "req-test" } });

async function fixture(t) {
  const originalCwd = process.cwd();
  const dir = await mkdtemp(path.join(os.tmpdir(), "scenra-provider-test-"));
  const image = path.join(dir, "input.png");
  await writeFile(image, png);
  t.after(async () => {
    assert.equal(path.dirname(dir), path.resolve(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith("scenra-provider-test-"));
    if (process.cwd() === dir) process.chdir(originalCwd);
    await rm(dir, { recursive: true, force: true });
  });
  return { dir, image, outputDir: path.join(dir, "output") };
}

function mockFetch(t, handler) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  t.after(() => { globalThis.fetch = original; });
}

test('World resumes operation metadata and recovers assets without paid resubmission', async (t) => {
  const { dir, image } = await fixture(t);
  process.chdir(dir);
  const output = 'worlds/set/output/world';
  await writeJson(requestPath(output, 0, 'world'), { endpoint: 'world-labs', status: 'running', request_id: 'operation-test', result: { operation_id: 'operation-test', done: false } });
  let calls = 0;
  mockFetch(t, async (url, options = {}) => {
    calls++;
    assert.notEqual(options.method, 'POST');
    if (url.endsWith('/operations/operation-test')) return json({ operation_id: 'operation-test', done: true, response: { world_id: 'world-test', assets: { mesh: { collider_mesh_url: 'https://assets.test/world.glb' }, splats: { spz_urls: { '500k': 'https://assets.test/world.spz' } } } } });
    if (url === 'https://assets.test/world.glb') return new Response(glb);
    if (url === 'https://assets.test/world.spz') return new Response(Buffer.from('spz-test'));
    throw new Error('Unexpected world request');
  });
  const result = await generateWorld({ world: 'set', image, pollIntervalMs: 0 });
  assert.equal(result.index, 0);
  assert.equal(path.basename(result.world_json), '0-world.json');
  assert.equal((await readJson(requestPath(output, 0, 'world'))).status, 'completed');
  assert.equal(calls, 3);
  const reused = await generateWorld({ world: 'set', image });
  assert.equal(reused.world_json, path.join(output, '0-world.json'));
  assert.equal(calls, 3);
  await rm(path.join(output, '0-world.glb'));
  await generateWorld({ world: 'set', image });
  assert.equal(calls, 4);
  assert.deepEqual(await readFile(path.join(output, '0-world.glb')), glb);
});

test('Read retries recover transient errors and refuse submission methods', async (t) => {
  let calls = 0;
  mockFetch(t, async () => { calls++; if (calls === 1) throw new Error('connection closed'); return new Response('ok', { status: calls === 2 ? 503 : 200 }); });
  assert.equal((await fetchRead('https://assets.test/read', {}, { delayMs: 0 })).status, 200);
  assert.equal(calls, 3);
  await assert.rejects(fetchRead('https://assets.test/generate', { method: 'POST' }), /GET and HEAD only/);
  assert.equal(calls, 3);
});

test("OpenAI uses image-only multipart endpoint and saves all PNG outputs without base64 or secrets", async (t) => {
  const { image, outputDir } = await fixture(t);
  let requests = 0;
  mockFetch(t, async (url, options) => {
    requests++;
    assert.equal(url, OPENAI_EDIT_ENDPOINT);
    assert.equal(options.method, "POST");
    assert.equal(options.headers.Authorization, "Bearer test-image-key");
    assert.equal(options.headers["Content-Type"], undefined);
    const form = options.body;
    assert.equal(form.get("model"), "gpt-image-2");
    assert.equal(form.get("n"), "2");
    assert.equal(form.get("quality"), "high");
    assert.equal(form.get("size"), "1024x1024");
    assert.equal(form.get("output_format"), "png");
    assert.equal(form.getAll("image[]").length, 1);
    assert.equal(form.get("image[]").type, "image/png");
    assert.deepEqual(Buffer.from(await form.get("mask").arrayBuffer()), png);
    return json({ data: [{ b64_json: png.toString("base64") }, { b64_json: png.toString("base64") }], usage: { total_tokens: 42 } });
  });
  const result = await generateEdit({ images: [image], prompt: "Remove chair", outputDir, outputSlug: "room-plate", numImages: 2, quality: "high", imageSize: "1024x1024", maskImage: image });
  assert.equal(requests, 1);
  assert.equal(path.basename(result.output_images[0]), "0-room-plate.png");
  assert.equal(path.basename(result.output_images[1]), "0-room-plate-2.png");
  for (const file of result.output_images) assert.deepEqual(await readFile(file), png);
  const saved = await readJson(result.request_metadata);
  assert.equal(saved.result.usage.total_tokens, 42);
  assert.equal(saved.provider, "openai");
  assert.equal(saved.status, "completed");
  assert.doesNotMatch(await readFile(result.request_metadata, "utf8"), /test-image-key|b64_json.*iVBOR/);
});

test("Interrupted OpenAI response blocks automatic resubmission; explicit regeneration uses new index", async (t) => {
  const { image, outputDir } = await fixture(t);
  let calls = 0;
  mockFetch(t, async () => { calls++; throw new Error("connection closed"); });
  const options = { images: [image], prompt: "Remove chair", outputDir, outputSlug: "plate" };
  await assert.rejects(generateEdit(options), /response was interrupted/);
  assert.equal((await readJson(requestPath(outputDir, 0, "plate"))).status, "unknown");
  await assert.rejects(generateEdit(options), /cannot be polled/);
  assert.equal(calls, 1);
  globalThis.fetch = async () => { calls++; return json({ data: [{ b64_json: png.toString("base64") }] }); };
  const result = await generateEdit({ ...options, regenerate: true });
  assert.equal(calls, 2);
  assert.equal(path.basename(result.output_image), "1-plate.png");
});

test("OpenAI permission rejection is persisted and same metadata never submits twice", async (t) => {
  const { image, outputDir } = await fixture(t);
  let calls = 0;
  mockFetch(t, async () => { calls++; return json({ error: { message: "Missing image request permission" } }, 403); });
  const options = { images: [image], prompt: "Edit", outputDir };
  await assert.rejects(runOpenAIImageEdit(options), /403.*Missing image request permission/);
  assert.equal((await readJson(requestPath(outputDir, 0, "image-edit"))).status, "failed");
  await assert.rejects(runOpenAIImageEdit(options), /cannot be polled/);
  assert.equal(calls, 1);
});

test("Tripo uploads local PNG, submits documented fields, polls task, and saves GLB", async (t) => {
  const { image, outputDir } = await fixture(t);
  const calls = [];
  let polls = 0;
  mockFetch(t, async (url, options = {}) => {
    calls.push([url, options.method || "GET"]);
    if (url.startsWith(TRIPO_BASE)) assert.equal(options.headers.Authorization, "Bearer test-tripo-key");
    else assert.equal(options.headers, undefined);
    if (url === `${TRIPO_BASE}/files`) {
      assert.deepEqual(Buffer.from(await options.body.get("file").arrayBuffer()), png);
      return json({ code: 0, data: { file_token: "file-test" } });
    }
    if (url.endsWith("/generation/image-to-model")) {
      assert.deepEqual(JSON.parse(options.body), { input: "file-test", model: "v3.1-20260211", face_limit: 50000, texture: true, pbr: true, smart_low_poly: false, texture_quality: "standard" });
      return json({ code: 0, data: { task_id: "task-test" } });
    }
    if (url.endsWith("/tasks/task-test")) {
      polls++;
      return json({ code: 0, data: polls === 1 ? { status: "running", progress: 40 } : { status: "success", output: { model_url: "https://assets.test/model.glb", rendered_image_url: "https://assets.test/thumbnail.png" }, credits_consumed: 20 } });
    }
    if (url.endsWith("model.glb")) return new Response(glb);
    if (url.endsWith("thumbnail.png")) return new Response(png);
    throw new Error(`Unexpected test request: ${url}`);
  });
  const result = await runTripo3D({ image, outputDir, pollIntervalMs: 0 });
  assert.equal(result.request_id, "task-test");
  assert.equal(result.provider, "tripo");
  assert.equal(result.result.credits_consumed, 20);
  assert.deepEqual(await readFile(result.output_files[0]), glb);
  assert.equal(polls, 2);
  assert.equal(calls.filter(([, method]) => method === "POST").length, 2);
});

test("Tripo resumes saved task and refreshes expired asset URLs without new upload or generation", async (t) => {
  const { image, outputDir } = await fixture(t);
  const metadataPath = requestPath(outputDir, 3, "chair", "model");
  await writeJson(metadataPath, { provider: "tripo", request_id: "saved-task", index: 3, endpoint: `${TRIPO_BASE}/generation/image-to-model`, status: "running", input_files: [image], result: { output: { model_url: "https://assets.test/expired.glb" } } });
  const calls = [];
  mockFetch(t, async (url, options = {}) => {
    calls.push(url);
    assert.equal(options.method, undefined);
    if (url === `${TRIPO_BASE}/tasks/saved-task`) return json({ code: 0, data: { status: "success", output: { model_url: "https://assets.test/fresh.glb" } } });
    assert.equal(url, "https://assets.test/fresh.glb");
    return new Response(glb);
  });
  const result = await runTripo3D({ image, outputDir, metadataPath });
  assert.deepEqual(calls, [`${TRIPO_BASE}/tasks/saved-task`, "https://assets.test/fresh.glb"]);
  assert.equal(path.basename(result.output_files[0]), "3-tripo-model.glb");
});

test("Tripo polling timeout retains task for resume", async (t) => {
  const { outputDir } = await fixture(t);
  mockFetch(t, async (url) => {
    if (url.endsWith("/generation/image-to-model")) return json({ code: 0, data: { task_id: "slow-task" } });
    return json({ code: 0, data: { status: "running", progress: 5 } });
  });
  await assert.rejects(runTripo3D({ image: "https://images.test/chair.png", outputDir, pollTimeoutMs: 0 }), /same command to resume/);
  const saved = await readJson(requestPath(outputDir, 0, "tripo", "model"));
  assert.equal(saved.request_id, "slow-task");
  assert.equal(saved.status, "running");
});

test("Ambiguous Tripo submission is retained and cannot silently create another task", async (t) => {
  const { outputDir } = await fixture(t);
  let submits = 0;
  mockFetch(t, async () => { submits++; return json({ code: 500, message: "upstream unavailable" }, 503); });
  const options = { image: "https://images.test/chair.png", outputDir };
  await assert.rejects(runTripo3D(options), /503/);
  assert.equal((await readJson(requestPath(outputDir, 0, "tripo", "model"))).status, "unknown");
  await assert.rejects(runTripo3D(options), /without a resumable Tripo task ID/);
  assert.equal(submits, 1);
});

test("Tripo rejects incompatible PBR and low-poly options before HTTP requests", async (t) => {
  const { outputDir } = await fixture(t);
  mockFetch(t, () => { assert.fail("Validation must precede network activity"); });
  await assert.rejects(runTripo3D({ image: "https://images.test/chair.png", outputDir, texture: "false", enablePbr: "true" }), /PBR requires texture/);
  assert.throws(() => buildTripoInput({ smartLowPoly: true }, "file-test"), /between 500 and 20000/);
  const geometry = buildTripoInput({ texture: false }, "file-test");
  assert.equal(geometry.texture, false);
  assert.equal(geometry.pbr, false);
});

test("Object pipeline saves reference plus viewer GLB and reuses them on second run", async (t) => {
  const { dir, image } = await fixture(t);
  const previousCwd = process.cwd();
  process.chdir(dir);
  t.after(() => process.chdir(previousCwd));
  const calls = [];
  mockFetch(t, async (url) => {
    calls.push(url);
    if (url === OPENAI_EDIT_ENDPOINT) return json({ data: [{ b64_json: png.toString("base64") }] });
    if (url.endsWith("/files")) return json({ code: 0, data: { file_token: "object-image" } });
    if (url.endsWith("/generation/image-to-model")) return json({ code: 0, data: { task_id: "object-task" } });
    if (url.endsWith("/tasks/object-task")) return json({ code: 0, data: { status: "success", output: { model_url: "https://assets.test/object.glb" } } });
    if (url === "https://assets.test/object.glb") return new Response(glb);
    throw new Error(`Unexpected test request: ${url}`);
  });
  const options = { world: "room", objectId: "chair", directImage: image, imageEditPrompt: "Isolate chair", pollIntervalMs: 0 };
  const result = await generateSingleObject(options);
  assert.equal(path.basename(result.reference_image), "0-chair.png");
  assert.equal(path.basename(result.model_files[0]), "0-chair.glb");
  assert.deepEqual(await readFile(result.model_files[0]), glb);
  const count = calls.length;
  assert.equal((await generateSingleObject(options)).skipped, true);
  assert.equal(calls.length, count);
  const regenerated = await generateSingleObject({ ...options, regenerate: true });
  assert.equal(path.basename(regenerated.model_files[0]), "1-chair.glb");
  assert.equal(regenerated.reference_image, result.reference_image);
  assert.equal(calls.filter((url) => url === OPENAI_EDIT_ENDPOINT).length, 1);
});

test("Environment loader accepts quoted/BOM values and keeps inherited keys", async (t) => {
  const { dir } = await fixture(t);
  const envPath = path.join(dir, "fixture.env");
  await writeFile(envPath, '\uFEFFOPENAI_API_KEY="fixture-image-key"\r\nTRIPO_API_KEY=\'fixture-tripo-key\'\r\n');
  const common = await import(`${pathToFileURL(path.join(REPO_ROOT, ".claude/scripts/asset-pipeline/common.mjs")).href}?env-test`);
  const previous = process.env.TRIPO_API_KEY;
  delete process.env.TRIPO_API_KEY;
  t.after(() => { process.env.TRIPO_API_KEY = previous; });
  await common.loadDotEnv(envPath);
  assert.equal(process.env.OPENAI_API_KEY, "test-image-key");
  assert.equal(process.env.TRIPO_API_KEY, "fixture-tripo-key");
});

test("CLI main guards execute from Windows paths and fail clearly for missing inputs", () => {
  for (const relative of [".claude/scripts/image-edit/generate-edit.mjs", ".claude/scripts/asset-pipeline/generate-single-asset.mjs", ".claude/scripts/world/generate-world.mjs"]) {
    const result = spawnSync(process.execPath, [path.join(REPO_ROOT, relative)], { cwd: os.tmpdir(), encoding: "utf8" });
    assert.equal(result.status, 1, `${relative} did not execute main`);
    assert.match(result.stderr, /required|Usage:/);
  }
});
