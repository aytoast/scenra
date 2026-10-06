import { Matrix4 } from 'three'

export interface SavedMotionManifest {
  version: number; name: string; fps: number; actorCount: number; frameCount: number; jointCount: number; data: string
}
export interface SavedMotion {
  manifest: SavedMotionManifest
  positions: Float32Array
  rotations: Float32Array
}
export interface CoreSkin {
  vertexCount: number; faceCount: number; jointCount: number; influenceCount: number
  vertices: Float32Array; normals: Float32Array; faces: Uint32Array
  inverseBind: Matrix4[]; indices: Uint16Array; weights: Float32Array
}

export function decodeSavedMotion(manifest: SavedMotionManifest, buffer: ArrayBuffer): SavedMotion {
  const { fps, actorCount, frameCount, jointCount } = manifest
  if (manifest.version !== 1 || jointCount !== 27 || !Number.isFinite(fps) || fps <= 0 || fps > 240
    || !Number.isInteger(actorCount) || actorCount < 1 || actorCount > 8
    || !Number.isInteger(frameCount) || frameCount < 1 || frameCount > 36000) throw new Error('Unsupported saved motion.')
  const total = actorCount * frameCount * jointCount
  if (buffer.byteLength !== total * 12 * 4) throw new Error('Saved motion is incomplete.')
  const values = new Float32Array(buffer)
  if (values.some((value) => !Number.isFinite(value))) throw new Error('Invalid saved motion.')
  return { manifest, positions: values.subarray(0, total * 3), rotations: values.subarray(total * 3) }
}

export function decodeCoreSkin(buffer: ArrayBuffer): CoreSkin {
  if (buffer.byteLength < 32 || new TextDecoder().decode(new Uint8Array(buffer, 0, 8)) !== 'ARDYSKIN') throw new Error('Invalid ARDY skin.')
  const [version, vertexCount, faceCount, jointCount, influenceCount] = new Uint32Array(buffer, 8, 6)
  if (version !== 1 || jointCount !== 27 || !vertexCount || vertexCount > 500000 || !faceCount || faceCount > 1000000
    || !influenceCount || influenceCount > 8) throw new Error('Unsupported ARDY skin.')
  const expected = 32 + vertexCount * 3 * 8 + faceCount * 3 * 4 + jointCount * 16 * 8 + vertexCount * influenceCount * 6
  if (buffer.byteLength !== expected) throw new Error('ARDY skin is incomplete.')
  let offset = 32
  const floats = (count: number) => { const array = new Float32Array(buffer, offset, count); offset += count * 4; return array }
  const vertices = floats(vertexCount * 3), normals = floats(vertexCount * 3)
  const faces = new Uint32Array(buffer, offset, faceCount * 3); offset += faceCount * 12
  floats(jointCount * 16) // Bind transforms; playback already contains global rotations.
  const inverseValues = floats(jointCount * 16)
  const inverseBind = Array.from({ length: jointCount }, (_, joint) => {
    const v = inverseValues.subarray(joint * 16, joint * 16 + 16)
    return new Matrix4().set(...Array.from(v) as Parameters<Matrix4['set']>)
  })
  const indices = new Uint16Array(buffer, offset, vertexCount * influenceCount); offset += indices.length * 2
  const weights = floats(vertexCount * influenceCount)
  if (indices.some((index) => index >= jointCount) || faces.some((index) => index >= vertexCount)) throw new Error('Invalid ARDY skin indices.')
  if ([vertices, normals, inverseValues, weights].some((array) => array.some((value) => !Number.isFinite(value)))) throw new Error('Invalid ARDY skin values.')
  return { vertexCount, faceCount, jointCount, influenceCount, vertices, normals, faces, inverseBind, indices, weights }
}

// Same five-influence LBS and row-major global transforms as Stageon CoreSkin preview.
export function poseSkin(skin: CoreSkin, motion: SavedMotion, actor: number, frame: number, matrices: Matrix4[], positions: Float32Array, normals: Float32Array) {
  const base = (actor * motion.manifest.frameCount + frame) * skin.jointCount
  for (let joint = 0; joint < skin.jointCount; joint++) {
    const p = (base + joint) * 3, r = (base + joint) * 9
    const rotations = motion.rotations, translations = motion.positions
    matrices[joint].set(rotations[r], rotations[r + 1], rotations[r + 2], translations[p],
      rotations[r + 3], rotations[r + 4], rotations[r + 5], translations[p + 1],
      rotations[r + 6], rotations[r + 7], rotations[r + 8], translations[p + 2], 0, 0, 0, 1).multiply(skin.inverseBind[joint])
  }
  for (let vertex = 0; vertex < skin.vertexCount; vertex++) {
    const v = vertex * 3
    const x = skin.vertices[v], y = skin.vertices[v + 1], z = skin.vertices[v + 2]
    const nx = skin.normals[v], ny = skin.normals[v + 1], nz = skin.normals[v + 2]
    let px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0
    for (let influence = 0; influence < skin.influenceCount; influence++) {
      const index = vertex * skin.influenceCount + influence, weight = skin.weights[index]
      if (weight <= 0) continue
      const m = matrices[skin.indices[index]].elements
      px += weight * (m[0] * x + m[4] * y + m[8] * z + m[12])
      py += weight * (m[1] * x + m[5] * y + m[9] * z + m[13])
      pz += weight * (m[2] * x + m[6] * y + m[10] * z + m[14])
      rx += weight * (m[0] * nx + m[4] * ny + m[8] * nz)
      ry += weight * (m[1] * nx + m[5] * ny + m[9] * nz)
      rz += weight * (m[2] * nx + m[6] * ny + m[10] * nz)
    }
    const length = Math.hypot(rx, ry, rz) || 1
    positions[v] = px; positions[v + 1] = py; positions[v + 2] = pz
    normals[v] = rx / length; normals[v + 1] = ry / length; normals[v + 2] = rz / length
  }
}
