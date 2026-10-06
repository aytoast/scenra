import { Quaternion, Vector3 } from 'three'
import type { SavedMotion } from './stageonData'
import type { Vec3Tuple } from '../../types/world'

// CoreSkeleton27 joint indices from saved Stageon take.
export const BODY_PARTS = [
  { name: 'torso', start: 0, end: 4, radius: 0.15 },
  { name: 'head', start: 5, end: 6, radius: 0.1 },
  { name: 'right-upper-arm', start: 8, end: 9, radius: 0.065 },
  { name: 'right-forearm', start: 9, end: 10, radius: 0.065 },
  { name: 'left-upper-arm', start: 14, end: 15, radius: 0.065 },
  { name: 'left-forearm', start: 15, end: 16, radius: 0.065 },
  { name: 'right-thigh', start: 19, end: 20, radius: 0.085 },
  { name: 'right-shin', start: 20, end: 21, radius: 0.07 },
  { name: 'right-foot', start: 21, end: 22, radius: 0.06 },
  { name: 'left-thigh', start: 23, end: 24, radius: 0.085 },
  { name: 'left-shin', start: 24, end: 25, radius: 0.07 },
  { name: 'left-foot', start: 25, end: 26, radius: 0.06 },
] as const

export interface BodyPartPose {
  position: Vector3
  rotation: Quaternion
  halfLength: number
}
const up = new Vector3(0, 1, 0)
const start = new Vector3(), end = new Vector3(), direction = new Vector3()

function jointAt(motion: SavedMotion, actor: number, joint: number, time: number, target: Vector3) {
  const { fps, frameCount, jointCount } = motion.manifest
  const frame = Math.max(0, Math.min(frameCount - 1, time * fps))
  const first = Math.floor(frame), next = Math.min(first + 1, frameCount - 1), fraction = frame - first
  const base = actor * frameCount * jointCount * 3
  const a = base + (first * jointCount + joint) * 3, b = base + (next * jointCount + joint) * 3
  const p = motion.positions
  target.set(p[a] + (p[b] - p[a]) * fraction, p[a + 1] + (p[b + 1] - p[a + 1]) * fraction, p[a + 2] + (p[b + 2] - p[a + 2]) * fraction)
}

export function bodyPartPose(motion: SavedMotion, actor: number, part: typeof BODY_PARTS[number], time: number, offset: Vec3Tuple, target: BodyPartPose) {
  jointAt(motion, actor, part.start, time, start)
  jointAt(motion, actor, part.end, time, end)
  target.position.copy(start).add(end).multiplyScalar(0.5)
  target.position.x += offset[0]; target.position.y += offset[1]; target.position.z += offset[2]
  direction.subVectors(end, start)
  target.halfLength = Math.max(direction.length() / 2, 0.001)
  target.rotation.setFromUnitVectors(up, direction.normalize())
  return target
}
