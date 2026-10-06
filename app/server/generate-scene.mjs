import path from 'node:path';
import { readFile, readdir, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { initialScene, defaultMotion, safeError } from './scene-data.mjs';
async function writeJson(file, value) { const temporary = `${file}.${randomUUID()}.tmp`; await writeFile(temporary,JSON.stringify(value,null,2)); await rename(temporary,file); }
const slugify = text => text.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
export async function generateScene(config, providers) {
  const { directory, slug, id, title, source, description, objects, performers } = config;
  const job = { id, slug, title, status: 'running', phase: 0, detail: 'Preparing source image', createdAt: config.createdAt };
  const update = async (phase, detail) => { Object.assign(job, { phase, detail }); await writeJson(path.join(directory, '.creation-job.json'), job); };
  try {
  if (!providers) {
    const [image,world,object] = await Promise.all([
      import(new URL('../../.claude/scripts/image-edit/generate-edit.mjs',import.meta.url).href),
      import(new URL('../../.claude/scripts/world/generate-world.mjs',import.meta.url).href),
      import(new URL('../../.claude/scripts/asset-pipeline/generate-single-asset.mjs',import.meta.url).href)
    ]);
    providers = { generateEdit:image.generateEdit,generateWorld:world.generateWorld,generateSingleObject:object.generateSingleObject };
  }
    await update(0, 'Preparing source image');
    let plate = source;
    if (objects.length) {
      const files = await readdir(path.join(directory, 'source'));
      const cached = files.filter(file => /^\d+-scene-plate\.png$/.test(file)).sort((a,b)=>parseInt(b)-parseInt(a))[0];
      plate = cached ? path.join(directory, 'source', cached) : (await providers.generateEdit({ images: [source], prompt: `Remove these movable objects: ${objects.join(', ')}. Fill background naturally. Preserve architecture, perspective, surfaces and lighting.`, outputDir: path.join(directory, 'source'), outputSlug: 'scene-plate', role: 'plate' })).output_image;
    }
    await update(1, 'Marble is building world and collision geometry');
    await providers.generateWorld({ world: slug, image: plate, prompt: description || 'Reconstruct reference environment faithfully. Preserve architecture, scale, materials and lighting. Leave open space for navigation.' });
    const props = [];
    for (let index = 0; index < objects.length; index++) {
      const name = objects[index], objectId = `${slugify(name) || 'object'}-${index + 1}`;
      await update(2, `Creating prop ${index + 1} of ${objects.length}: ${name}`);
      await providers.generateSingleObject({ world: slug, objectId, objectName: name, description: name, directImage: source, imageEditPrompt: `Isolate exactly one ${name} from reference image. Complete single object on plain white background. Preserve materials and proportions; remove all surroundings.`, faceLimit: 50000 });
      props.push({ id: objectId, name });
    }
    await update(3, 'Placing props and adding physics');
    await writeJson(path.join(directory, 'scene.json'), initialScene(slug, props));
    await writeJson(path.join(directory, 'project.json'), { schema_version: 1, slug, display_name: title, player_spawn: { position: [-1.5, 1.9, 4.5], yaw: 0 }, ...(performers ? { motion: defaultMotion } : {}) });
    Object.assign(job, { status: 'completed', phase: 4, detail: 'Scene ready', finishedAt: new Date().toISOString() });
    await writeJson(path.join(directory, '.creation-job.json'), job);
    return job;
  } catch (error) {
    Object.assign(job, { status: 'error', error: safeError(error), detail: 'Creation stopped. Saved outputs remain available.' });
    await writeJson(path.join(directory, '.creation-job.json'), job);
    return job;
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) generateScene(JSON.parse(await readFile(process.argv[2], 'utf8'))).catch(() => { process.exitCode = 1; });
