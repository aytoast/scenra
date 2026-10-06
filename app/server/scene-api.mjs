import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { defaultMotion, initialScene, safeError } from './scene-data.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const worker = fileURLToPath(new URL('./generate-scene.mjs', import.meta.url));
const json = async (file, value) => writeFile(file, JSON.stringify(value, null, 2));

export function uploadedFile(file, kind) {
  if (!file || typeof file.name !== 'string' || typeof file.data !== 'string') throw new Error('Choose required file.');
  const match = file.data.match(/^data:[a-z0-9.+/-]+;base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) throw new Error('Invalid uploaded file.');
  const bytes = Buffer.from(match[1], 'base64');
  if (!bytes.length || bytes.length > 40 * 1024 * 1024) throw new Error('Each file must be smaller than 40 MB.');
  const extension = path.extname(file.name).toLowerCase();
  const header = bytes.subarray(0, 12);
  if (kind === 'image' && !((extension === '.png' && header.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) || (['.jpg','.jpeg'].includes(extension) && header[0] === 255 && header[1] === 216) || (extension === '.webp' && header.toString('ascii',0,4) === 'RIFF' && header.toString('ascii',8,12) === 'WEBP'))) throw new Error('Choose PNG, JPEG or WebP image.');
  if (kind === 'glb' && (extension !== '.glb' || bytes.length < 12 || header.toString('ascii',0,4) !== 'glTF' || header.readUInt32LE(4) !== 2 || header.readUInt32LE(8) !== bytes.length)) throw new Error('Choose valid GLB model.');
  if (kind === 'spz' && (extension !== '.spz' || !(header.toString('ascii',0,4) === 'NGSP' || (header[0] === 31 && header[1] === 139)))) throw new Error('Choose valid World Labs SPZ file.');
  return { bytes, extension };
}
export function worldSemantics(metadata) {
  const input = metadata?.assets?.splats?.semantics_metadata || {};
  const metric_scale_factor = input.metric_scale_factor ?? 1, ground_plane_offset = input.ground_plane_offset ?? 0;
  if (!Number.isFinite(metric_scale_factor) || metric_scale_factor <= 0 || !Number.isFinite(ground_plane_offset)) throw new Error('Invalid world scale or ground offset.');
  return { metric_scale_factor, ground_plane_offset, flip_y: input.flip_y ?? true };
}
async function body(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > 120 * 1024 * 1024) throw new Error('Upload exceeds 120 MB.'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function identity(input) {
  if (!/^[a-f0-9-]{36}$/.test(input.id || '')) throw new Error('Invalid creation ID.');
  const slug = `scene-${input.id}`;
  return { id: input.id, slug, directory: path.join(root, 'worlds', slug), title: String(input.title || 'Untitled scene').trim().slice(0, 80), createdAt: new Date().toISOString() };
}
const jobFile = directory => path.join(directory, '.creation-job.json');
export function sceneApiPlugin() {
  const submitting = new Set();
  const launch = info => { const child = spawn(globalThis.process.execPath,[worker,path.join(info.directory,'.creation-input.json')],{cwd:root,windowsHide:true,detached:true,stdio:'ignore'}); child.on('error',async error=>{await json(jobFile(info.directory),{id:info.id,slug:info.slug,title:info.title,status:'error',error:safeError(error)});}); child.unref(); };
  return { name: 'scene-creation-api', configureServer(server) {
    server.middlewares.use('/__scene-api', async (req, res) => {
      res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
      const send = (code, value) => { res.statusCode = code; res.end(JSON.stringify(value)); };
      try {
        if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return send(403, { error: 'Use same-origin requests.' });
        const route = new URL(req.url || '/', 'http://localhost').pathname;
        if (req.method === 'GET' && route === '/status') {
          const { loadDotEnv, requireEnv } = await import(new URL('../../.claude/scripts/asset-pipeline/common.mjs', import.meta.url).href);
          await loadDotEnv();
          const configured = {};
          for (const [label, key] of [['world','WORLD_LABS_API_KEY'],['images','OPENAI_API_KEY'],['objects','TRIPO_API_KEY']]) { try { await requireEnv(key); configured[label] = true; } catch { configured[label] = false; } }
          return send(200, configured);
        }
        if (req.method === 'GET' && route.startsWith('/jobs/')) {
          const { directory } = identity({ id: route.slice(6) });
          try { return send(200, JSON.parse(await readFile(jobFile(directory), 'utf8'))); } catch { return send(404, { error: 'Scene job not found.' }); }
        }
        if (req.method !== 'POST' || !['/generate','/import','/resume'].includes(route)) return send(404, { error: 'Route not found.' });
        const input = await body(req), info = identity(input);
        const existing = await readFile(jobFile(info.directory),'utf8').then(JSON.parse).catch(()=>null);
        if (route === '/resume') {
          if (!existing) throw new Error('Saved creation was not found.');
          if (existing.status !== 'error' || submitting.has(info.id)) return send(200,existing);
          submitting.add(info.id);
          try {
            await readFile(path.join(info.directory,'.creation-input.json'),'utf8');
            const queued = {...existing,status:'queued',error:undefined,detail:'Resuming saved work'};
            await json(jobFile(info.directory),queued); launch(info); return send(202,queued);
          } finally { submitting.delete(info.id); }
        }
        if (existing) return send(200,existing);
        if (submitting.has(info.id)) return send(202,{id:info.id,slug:info.slug,title:info.title,status:'queued',phase:0,detail:'Preparing submission'});
        submitting.add(info.id);
        try {
        if (route === '/generate') {
          const source = uploadedFile(input.image, 'image');
          const objects = Array.isArray(input.objects) ? input.objects.map(name => String(name).trim()).filter(Boolean) : [];
          if (objects.length > 8 || objects.some(name => name.length > 160)) throw new Error('Choose up to 8 props with short descriptions.');
          const description = String(input.description || '').slice(0, 1500);
          const config = { ...info, source: path.join(info.directory, 'source', `0-source${source.extension}`), description, objects, performers: Boolean(input.performers) };
          await mkdir(path.dirname(config.source), { recursive: true }); await writeFile(config.source, source.bytes);
          await json(path.join(info.directory, '.creation-input.json'), config);
          const job = { ...info, directory: undefined, status: 'queued', phase: 0, detail: 'Starting scene creation' };
          await json(jobFile(info.directory), job);
          launch(info);
          return send(202, job);
        }
        const splat = uploadedFile(input.splat, 'spz');
        const collider = input.collider ? uploadedFile(input.collider, 'glb') : undefined;
        const image = input.image ? uploadedFile(input.image, 'image') : undefined;
        if (!Array.isArray(input.props) || input.props.length > 8) throw new Error('Import up to 8 prop models.');
        const props = input.props.map((file,index) => ({ ...uploadedFile(file,'glb'), id:`prop-${index+1}`, name: path.basename(file.name,'.glb').slice(0,80) }));
        const semantics = worldSemantics(input.metadata);
        const metricScaleFactor = semantics.metric_scale_factor, groundPlaneOffset = semantics.ground_plane_offset;
        const dir = path.join(info.directory,'output','world'); await mkdir(dir,{recursive:true});
        await writeFile(path.join(dir,'0-world-full_res.spz'),splat.bytes);
        if (collider) await writeFile(path.join(dir,'0-world.glb'),collider.bytes);
        if (image) { await mkdir(path.join(info.directory,'source'),{recursive:true}); await writeFile(path.join(info.directory,'source',`0-source${image.extension}`),image.bytes); }
        await json(path.join(dir,'0-world.json'), { world_id: info.slug, display_name: info.title, assets: { mesh: { collider_mesh_url: collider ? `/worlds/${info.slug}/output/world/0-world.glb` : '' }, imagery: { pano_url:'' }, splats: { spz_urls: { full_res:`/worlds/${info.slug}/output/world/0-world-full_res.spz` }, semantics_metadata: { metric_scale_factor:metricScaleFactor, ground_plane_offset:groundPlaneOffset, flip_y:semantics.flip_y } }, thumbnail_url:'',caption:info.title } });
        for (const prop of props) { const target=path.join(info.directory,'output',prop.id); await mkdir(target,{recursive:true}); await writeFile(path.join(target,`0-${prop.id}.glb`),prop.bytes); await json(path.join(target,'object.json'),{ schema_version:1,world:info.slug,object:{id:prop.id,name:prop.name,generate_as_3d_object:true} }); }
        const scene = { ...initialScene(info.slug,props), metricScaleFactor, groundPlaneOffset };
        await json(path.join(info.directory,'scene.json'),scene);
        await json(path.join(info.directory,'project.json'),{ schema_version:1,slug:info.slug,display_name:info.title,player_spawn:{position:[-1.5,1.9,4.5],yaw:0},...(input.performers?{motion:defaultMotion}:{}) });
        const job={id:info.id,slug:info.slug,title:info.title,status:'completed',phase:4,detail:'Scene imported',createdAt:info.createdAt}; await json(jobFile(info.directory),job);
        send(201,job);
        } finally { submitting.delete(info.id); }
      } catch(error) { send(400,{error:safeError(error)}); }
    });
  } };
}
