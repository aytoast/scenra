import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Matrix4 } from 'three'
import { describe, expect, it } from 'vitest'
import { decodeCoreSkin, decodeSavedMotion, poseSkin, type SavedMotionManifest } from './stageonData'

const assets = new URL('../../../public/stageon/', import.meta.url)
function binary(name: string) {
  const bytes = readFileSync(fileURLToPath(new URL(name, assets)))
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}
const manifest = JSON.parse(readFileSync(fileURLToPath(new URL('fight-fall.json', assets)), 'utf8')) as SavedMotionManifest

describe('saved Stageon motion adapter', () => {
  it('preserves original saved duration, actor count and complete global rotations', () => {
    const motion = decodeSavedMotion(manifest, binary('fight-fall.bin'))
    expect(motion.manifest.actorCount).toBe(2)
    expect(motion.manifest.frameCount / motion.manifest.fps).toBe(12)
    expect(motion.positions.length).toBe(2 * 240 * 27 * 3)
    expect(motion.rotations.length).toBe(2 * 240 * 27 * 9)
  })

  it('matches independent landmarks from original Stageon renderer', () => {
    const motion = decodeSavedMotion(manifest, binary('fight-fall.bin'))
    const skin = decodeCoreSkin(binary('core-skin.bin'))
    expect(skin.vertexCount).toBe(9084)
    expect(skin.influenceCount).toBe(5)
    const positions = new Float32Array(skin.vertexCount * 3), normals = new Float32Array(skin.vertexCount * 3)
    const matrices = Array.from({ length: skin.jointCount }, () => new Matrix4())
    const landmarks = [
      { actor: 0, frame: 0, position: [-0.5655787587, 1.5088294744, -0.0900606588], normal: [0.1022871360, -0.1009332165, -0.9896210432] },
      { actor: 1, frame: 120, position: [1.0142142773, 1.5729570389, -0.2319828719], normal: [0.3222119510, -0.0014179562, 0.9466664791] },
      { actor: 0, frame: 239, position: [-0.7285304070, 1.4600226879, 0.3143058419], normal: [-0.2474303544, 0.0010846467, -0.9689050913] },
    ]
    for (const landmark of landmarks) {
      poseSkin(skin, motion, landmark.actor, landmark.frame, matrices, positions, normals)
      for (let axis = 0; axis < 3; axis++) {
        expect(positions[300 + axis]).toBeCloseTo(landmark.position[axis], 6)
        expect(normals[300 + axis]).toBeCloseTo(landmark.normal[axis], 6)
      }
    }
  })

  it('rejects truncated or non-finite motion and corrupted skin before rendering', () => {
    expect(() => decodeSavedMotion(manifest, new ArrayBuffer(16))).toThrow('Saved motion is incomplete.')
    const corrupt = binary('fight-fall.bin')
    new Float32Array(corrupt)[0] = NaN
    expect(() => decodeSavedMotion(manifest, corrupt)).toThrow('Invalid saved motion.')
    expect(() => decodeCoreSkin(new ArrayBuffer(32))).toThrow('Invalid ARDY skin.')
  })
})
