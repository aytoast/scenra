export const defaultMotion = { manifest_url: '/stageon/fight-fall.json', skin_url: '/stageon/core-skin.bin', position: [0, 0.03, -3] };
export function initialScene(slug, objects) {
  return { version: 1, instances: objects.map((object, index) => ({ instanceId: `prop-${object.id}`, objectId: `${object.id}-0`, assetId: `${slug}/${object.id}/0`, physics: 'rigidbody', position: [(index - (objects.length - 1) / 2) * 1.4, 0, -3.8], rotation: [0, 0, 0], scale: [2, 2, 2] })), groundPlaneColliderEnabled: true, sun: { intensity: 1.6, rotation: [0.4, 0, -0.4], environmentIntensity: 0.8 } };
}
export function safeError(error) {
  let message = error instanceof Error ? error.message : String(error);
  for (const key of ['OPENAI_API_KEY', 'TRIPO_API_KEY', 'WORLD_LABS_API_KEY']) if (process.env[key]) message = message.split(process.env[key]).join('[redacted]');
  return message.slice(0, 1000);
}
