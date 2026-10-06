#!/usr/bin/env node
import { copyFile, readdir } from 'node:fs/promises';
import { generateEdit } from '../.claude/scripts/image-edit/generate-edit.mjs';
import { generateSingleObject } from '../.claude/scripts/asset-pipeline/generate-single-asset.mjs';
import { generateWorld } from '../.claude/scripts/world/generate-world.mjs';
import { ensureDir, pathExists, REPO_ROOT, writeJson } from '../.claude/scripts/asset-pipeline/common.mjs';
import { parseIndexedName } from '../.claude/scripts/asset-pipeline/request-metadata.mjs';
import { setupDemo } from './setup-demo.mjs';

async function main() {
  process.chdir(REPO_ROOT);
  const world = 'temple-courtyard', source = `worlds/${world}/source/0-temple-courtyard.png`;
  await ensureDir(`worlds/${world}/source`);
  if (!(await pathExists(source))) await copyFile('input/temple-courtyard-source.png', source);
  const props = [
    ['wooden-bench', 'Wooden bench', 'low weathered wooden bench'],
    ['tea-table', 'Tea table', 'small dark wooden tea table'],
    ['incense-burner', 'Incense burner', 'unlit bronze incense burner'],
  ];
  const latestImage = async (directory, slug) => {
    const files = await readdir(directory).catch(() => []);
    const found = files.map(parseIndexedName).filter((file) => file && !file.hidden && file.slug === slug && ['.png', '.jpg', '.jpeg'].includes(file.extension.toLowerCase())).sort((a, b) => b.index - a.index)[0];
    return found ? `${directory}/${found.name}` : undefined;
  };
  let platePath = await latestImage(`worlds/${world}/source`, 'temple-courtyard-plate');
  if (process.argv.includes('--existing-references')) {
    if (!platePath) throw new Error('Add indexed courtyard plate PNG before generating.');
    for (const [id] of props) if (!(await latestImage(`worlds/${world}/output/${id}`, id))) throw new Error(`Add indexed ${id} PNG before generating.`);
  }
  if (!platePath) {
    console.log('Preparing courtyard clean plate with OpenAI.');
    platePath = (await generateEdit({ images: [source], prompt: 'Remove wooden bench, tea table, and bronze incense burner. Preserve architecture, paving, bamboo, lighting, perspective, and photographic style.', outputDir: `worlds/${world}/source`, outputSlug: 'temple-courtyard-plate', role: 'plate' })).output_image;
  }
  const jobs = await Promise.allSettled([
    (async () => {
      console.log('Preparing courtyard world; saved operation resumes.');
      await generateWorld({ world, image: platePath, prompt: 'Empty traditional Chinese temple courtyard after rain. Grey stone paving, white plaster, weathered timber colonnade, tiled roofs and bamboo. Open walking space, overcast daylight. Preserve reference architecture.' });
      console.log('Courtyard world ready.');
    })(),
    (async () => {
      for (const [objectId, name, description] of props) {
        const dir = `worlds/${world}/output/${objectId}`;
        if (!(await pathExists(`${dir}/object.json`))) await writeJson(`${dir}/object.json`, { schema_version: 1, world, object: { id: objectId, name, description, source_images: [source], generate_as_3d_object: true, working_dir: dir } });
        console.log(`Preparing ${name}; existing references and models reuse.`);
        await generateSingleObject({ world, objectId, imageEditPrompt: `Isolate exactly one ${description} from reference. Complete single object on plain white background. Preserve materials and proportions; remove surroundings.`, faceLimit: 50000 });
      }
    })(),
  ]);
  const failed = jobs.filter((job) => job.status === 'rejected');
  if (failed.length) throw new Error(failed.map((job) => job.reason.message).join('\n'));
  await setupDemo();
  console.log('Courtyard demo ready. Open /temple-courtyard.');
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
