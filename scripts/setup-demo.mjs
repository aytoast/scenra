#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { Box3, Matrix4, Quaternion, Vector3 } from 'three';
import { isMain, pathExists, readJson, REPO_ROOT, writeJson } from '../.claude/scripts/asset-pipeline/common.mjs';

const world = 'temple-courtyard';
const directory = path.join(REPO_ROOT, 'worlds', world);
export async function latestModel(objectId) {
  const dir = path.join(directory, 'output', objectId);
  const files = await readdir(dir);
  const found = files.map((name) => ({ name, index: Number(name.match(/^(\d+)-/)?.[1]) })).filter(({ name, index }) => Number.isInteger(index) && name === `${index}-${objectId}.glb`).sort((a, b) => b.index - a.index)[0];
  if (!found) throw new Error(`Generate ${objectId} before setting up courtyard.`);
  return { ...found, path: path.join(dir, found.name), id: `${objectId}-${found.index}`, assetId: `${world}/${objectId}/${found.index}` };
}

// Read GLB bounds without loading textures or requiring browser APIs.
async function modelSize(file) {
  const data = await readFile(file);
  if (data.toString('ascii', 0, 4) !== 'glTF') throw new Error('Invalid GLB');
  const length = data.readUInt32LE(12);
  const document = JSON.parse(data.toString('utf8', 20, 20 + length));
  const bounds = new Box3();
  const visit = (index, parent) => {
    const node = document.nodes[index];
    const local = node.matrix ? new Matrix4().fromArray(node.matrix) : new Matrix4().compose(new Vector3().fromArray(node.translation || [0, 0, 0]), new Quaternion().fromArray(node.rotation || [0, 0, 0, 1]), new Vector3().fromArray(node.scale || [1, 1, 1]));
    const matrix = parent.clone().multiply(local);
    for (const primitive of document.meshes?.[node.mesh]?.primitives || []) {
      const accessor = document.accessors[primitive.attributes.POSITION];
      if (accessor.min && accessor.max) bounds.union(new Box3(new Vector3().fromArray(accessor.min), new Vector3().fromArray(accessor.max)).applyMatrix4(matrix));
    }
    for (const child of node.children || []) visit(child, matrix);
  };
  for (const index of document.scenes[document.scene || 0].nodes) visit(index, new Matrix4());
  const size = bounds.getSize(new Vector3());
  if (bounds.isEmpty() || Math.max(size.x, size.y, size.z) <= 0) throw new Error('GLB has no usable bounds');
  return size;
}

export async function setupDemo() {
  const definitions = [
    { id: 'wooden-bench', position: [-1.8, 0, -0.7], meters: 1.9, axis: 'width' },
    { id: 'tea-table', position: [0, 0, 0], meters: 0.8, axis: 'width' },
    { id: 'incense-burner', position: [2.4, 0, -1.4], meters: 0.85, axis: 'height' },
  ];
  const instances = [];
  for (const definition of definitions) {
    const model = await latestModel(definition.id), size = await modelSize(model.path);
    const factor = 2 * definition.meters / (definition.axis === 'height' ? size.y : Math.max(size.x, size.z));
    instances.push({ instanceId: `prop-${definition.id}`, objectId: model.id, assetId: model.assetId, physics: 'rigidbody', position: definition.position, rotation: [0, 0, 0], scale: [factor, factor, factor] });
  }
  const scenePath = path.join(directory, 'scene.json');
  if (!(await pathExists(scenePath))) await writeJson(scenePath, { version: 1, instances, sun: { intensity: 1.6, rotation: [0.4, 0, -0.4], environmentIntensity: 0.8 }, groundPlaneColliderEnabled: true, shadowCatcherOpacity: 0.35, shadowCatcherColor: '#272a25' });
  const projectPath = path.join(directory, 'project.json');
  const project = await readJson(projectPath);
  if (!project.player_spawn || !project.motion) await writeJson(projectPath, {
    ...project,
    player_spawn: project.player_spawn ?? { position: [-1.5, 1.9, 4.5], yaw: 0 },
    motion: project.motion ?? { manifest_url: '/stageon/fight-fall.json', skin_url: '/stageon/core-skin.bin', position: [0, 0.03, -3] },
  });
}
if (isMain(import.meta.url)) setupDemo().then(() => console.log('Courtyard physics scene ready.')).catch((error) => { console.error(error.message); process.exitCode = 1; });
