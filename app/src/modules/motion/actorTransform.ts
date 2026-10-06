import { clipSourceFrame, rootAt, type ActorClip, type Point } from './directorTimeline'
import type { SavedMotion } from './stageonData'

function rotate(point: Point, yaw: number): Point {
  return [Math.cos(yaw) * point[0] + Math.sin(yaw) * point[1], -Math.sin(yaw) * point[0] + Math.cos(yaw) * point[1]]
}

/** Move blocking endpoints together; turn recorded motion around current actor root. */
export function transformActorClip(clip: ActorClip, actor: number, frame: number, saved: SavedMotion, offset: Point, yawDelta = 0): ActorClip {
  if (![...offset, yawDelta].every(Number.isFinite)) throw new Error('Actor transform must use finite coordinates.')
  const next = structuredClone(clip)
  if (offset[0] === 0 && offset[1] === 0 && yawDelta === 0) return next
  if (clip.kind === 'saved' && clip.native) {
    const start = rotate(rootAt(saved, actor, clip.sourceStartFrame), clip.yaw)
    next.from = [...start]
    next.to = [...start]
  }
  let compensation: Point = [0, 0]
  if (clip.kind === 'saved' && yawDelta !== 0) {
    const root = rootAt(saved, actor, clipSourceFrame(clip, frame))
    const start = rootAt(saved, actor, clip.sourceStartFrame)
    const displacement: Point = [root[0] - start[0], root[1] - start[1]]
    const before = rotate(displacement, clip.yaw)
    const after = rotate(displacement, clip.yaw + yawDelta)
    compensation = [before[0] - after[0], before[1] - after[1]]
  }
  const delta: Point = [offset[0] + compensation[0], offset[1] + compensation[1]]
  next.from = [next.from[0] + delta[0], next.from[1] + delta[1]]
  next.to = [next.to[0] + delta[0], next.to[1] + delta[1]]
  next.yaw += yawDelta
  next.native = false
  return next
}
