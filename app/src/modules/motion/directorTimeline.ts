import type { SavedMotion } from './stageonData'

export type Point = [number, number]
export type ClipKind = 'saved' | 'walk' | 'idle'
export interface ActorClip {
  id: string; kind: ClipKind; prompt: string
  startFrame: number; endFrame: number
  sourceStartFrame: number; sourceEndFrame: number
  from: Point; to: Point; yaw: number; native: boolean
  walkPhaseFrame?: number
}
export interface ActorTrack { actor: number; name: string; clips: ActorClip[] }
export interface DirectorTimeline { version: 1; fps: number; frameCount: number; actors: ActorTrack[] }
export interface MotionLibrary { saved: SavedMotion; walk: SavedMotion; idle: SavedMotion }
export interface ActorSample { motion: SavedMotion; actor: number; sourceFrame: number; translation: [number, number, number]; yaw: number }

export function rootAt(motion: SavedMotion, actor: number, frame: number): Point {
  const index = (actor * motion.manifest.frameCount + frame) * motion.manifest.jointCount * 3
  return [motion.positions[index], motion.positions[index + 2]]
}

export function originalTimeline(motion: SavedMotion): DirectorTimeline {
  const { fps, frameCount, actorCount } = motion.manifest
  return { version: 1, fps, frameCount, actors: Array.from({ length: actorCount }, (_, actor) => {
    const point = rootAt(motion, actor, 0)
    return { actor, name: `Actor ${String.fromCharCode(65 + actor)}`, clips: [{ id: `take-${actor}`, kind: 'saved', prompt: 'Fight and fall.', startFrame: 0, endFrame: frameCount, sourceStartFrame: 0, sourceEndFrame: frameCount - 1, from: point, to: point, yaw: 0, native: true }] }
  }) }
}

/** Restore one actor without resetting other tracks, names or an extended shot. */
export function restoreActorClips(current: DirectorTimeline, original: DirectorTimeline, actor: number, createId: () => string): DirectorTimeline {
  const source = original.actors.find(track => track.actor === actor)
  if (!source || !current.actors.some(track => track.actor === actor)) throw new Error('Actor does not exist in timeline.')
  const next = structuredClone(current)
  const ids = new Set([...current.actors, ...original.actors].flatMap(track => track.clips.map(clip => clip.id)))
  next.actors.find(track => track.actor === actor)!.clips = source.clips.map(clip => {
    const id = createId()
    if (typeof id !== 'string' || !id || ids.has(id)) throw new Error('Restored clips need unique IDs.')
    ids.add(id)
    return { ...structuredClone(clip), id }
  })
  next.frameCount = Math.max(current.frameCount, ...source.clips.map(clip => clip.endFrame))
  return next
}

/** Remove earlier demo's prefixed walk/hold without discarding edited take settings. */
export function removeDemoIntro(value: DirectorTimeline): DirectorTimeline {
  const intro = value.actors.flatMap(track => track.clips).find(clip => clip.id === 'intro-0' && clip.startFrame === 0)
  if (!intro || !value.actors.every(track => track.clips.length > 1 && track.clips.some(clip => clip.id === `intro-${track.actor}` && clip.startFrame === 0 && clip.endFrame === intro.endFrame))) return value
  const next = structuredClone(value)
  next.frameCount -= intro.endFrame
  for (const track of next.actors) {
    track.clips = track.clips.filter(clip => clip.id !== `intro-${track.actor}`).map(clip => ({ ...clip, startFrame: clip.startFrame - intro.endFrame, endFrame: clip.endFrame - intro.endFrame }))
  }
  return next
}

/** Stageon's separate actor/action lanes and source-frame mapping, with local blocking clips. */
export function approachTimeline(motion: SavedMotion): DirectorTimeline {
  return approachFromTimeline(originalTimeline(motion))
}

export function approachFromTimeline(original: DirectorTimeline): DirectorTimeline {
  const timeline = structuredClone(original), intro = Math.round(3 * timeline.fps)
  timeline.frameCount += intro
  timeline.actors.forEach((track, actor) => {
    const saved = track.clips[0], point = saved.from
    saved.startFrame += intro; saved.endFrame += intro
    track.clips.unshift({ ...saved, id: `intro-${actor}`, kind: actor === 0 ? 'walk' : 'idle', prompt: actor === 0 ? 'Approach partner, then perform saved take.' : 'Wait for partner.', startFrame: 0, endFrame: intro, from: actor === 0 ? [point[0] - 2, point[1]] : point, to: point, yaw: 0, native: false })
  })
  return timeline
}

export function activeClip(track: ActorTrack, frame: number) {
  const clips = [...track.clips].sort((a, b) => a.startFrame - b.startFrame)
  return clips.find((item) => frame >= item.startFrame && frame < item.endFrame)
    ?? [...clips].reverse().find((item) => frame >= item.endFrame) ?? clips[0]
}

export function clipFraction(clip: ActorClip, frame: number) {
  return Math.max(0, Math.min(frame - clip.startFrame, clip.endFrame - clip.startFrame - 1)) / Math.max(1, clip.endFrame - clip.startFrame - 1)
}

export function clipSourceFrame(clip: ActorClip, frame: number) {
  return Math.round(clip.sourceStartFrame + clipFraction(clip, frame) * (clip.sourceEndFrame - clip.sourceStartFrame))
}

export function clipRoot(clip: ActorClip, actor: number, frame: number, saved: SavedMotion): Point {
  const fraction = clipFraction(clip, frame), source = clipSourceFrame(clip, frame)
  const root = rootAt(saved, actor, source), start = rootAt(saved, actor, clip.sourceStartFrame)
  if (clip.kind === 'saved' && clip.native) return [Math.cos(clip.yaw) * root[0] + Math.sin(clip.yaw) * root[1], -Math.sin(clip.yaw) * root[0] + Math.cos(clip.yaw) * root[1]]
  const dx = clip.kind === 'saved' ? root[0] - start[0] : 0, dz = clip.kind === 'saved' ? root[1] - start[1] : 0
  return [clip.from[0] + (clip.to[0] - clip.from[0]) * fraction + Math.cos(clip.yaw) * dx + Math.sin(clip.yaw) * dz, clip.from[1] + (clip.to[1] - clip.from[1]) * fraction - Math.sin(clip.yaw) * dx + Math.cos(clip.yaw) * dz]
}

export function splitActorClip(clip: ActorClip, actor: number, frame: number, saved: SavedMotion, rightId: string): [ActorClip, ActorClip] {
  if (frame <= clip.startFrame || frame >= clip.endFrame - 1) throw new Error('Move playhead inside selected clip to split.')
  const fraction = clipFraction(clip, frame - 1)
  const point: Point = [clip.from[0] + (clip.to[0] - clip.from[0]) * fraction, clip.from[1] + (clip.to[1] - clip.from[1]) * fraction]
  const source = clipSourceFrame(clip, frame), root = rootAt(saved, actor, source), first = rootAt(saved, actor, clip.sourceStartFrame)
  const dx = clip.kind === 'saved' ? root[0] - first[0] : 0, dz = clip.kind === 'saved' ? root[1] - first[1] : 0
  const rightEnd: Point = [clip.to[0] + Math.cos(clip.yaw) * dx + Math.sin(clip.yaw) * dz, clip.to[1] - Math.sin(clip.yaw) * dx + Math.cos(clip.yaw) * dz]
  const phase = clip.kind === 'walk' ? { walkPhaseFrame: (clip.walkPhaseFrame ?? 0) + frame - clip.startFrame } : {}
  const left = { ...clip, endFrame: frame, to: point, sourceEndFrame: clipSourceFrame(clip, frame - 1) }
  const right = { ...clip, ...phase, id: rightId, startFrame: frame, from: clipRoot(clip, actor, frame, saved), to: rightEnd, sourceStartFrame: source }
  if (clip.kind === 'walk') {
    const facing = walkYaw(clip)
    left.yaw += facing - walkYaw(left)
    right.yaw += facing - walkYaw(right)
  }
  return [left, right]
}

function walkYaw(clip: ActorClip) {
  return Math.hypot(clip.to[0] - clip.from[0], clip.to[1] - clip.from[1]) > 0.001
    ? Math.atan2(clip.to[0] - clip.from[0], clip.to[1] - clip.from[1]) + clip.yaw : clip.yaw
}

export function sampleActor(library: MotionLibrary, track: ActorTrack, frame: number): ActorSample {
  const clip = activeClip(track, frame)
  const motion = library[clip.kind], actor = clip.kind === 'saved' ? track.actor : 0
  const elapsed = Math.max(0, Math.min(frame - clip.startFrame, clip.endFrame - clip.startFrame - 1))
  const fraction = clipFraction(clip, frame)
  const sourceFrame = clip.kind === 'saved'
    ? Math.round(clip.sourceStartFrame + fraction * (clip.sourceEndFrame - clip.sourceStartFrame))
    : clip.kind === 'walk' ? ((clip.walkPhaseFrame ?? 0) + elapsed) % motion.manifest.frameCount : 0
  const root = rootAt(motion, actor, sourceFrame)
  const yaw = clip.kind === 'walk' ? walkYaw(clip) : clip.yaw
  if (clip.kind === 'saved' && clip.native) return { motion, actor, sourceFrame, translation: [0, 0, 0], yaw }
  let x = clip.from[0] + (clip.to[0] - clip.from[0]) * fraction
  let z = clip.from[1] + (clip.to[1] - clip.from[1]) * fraction
  if (clip.kind === 'saved') {
    const start = rootAt(motion, actor, clip.sourceStartFrame)
    const dx = root[0] - start[0], dz = root[1] - start[1]
    x += Math.cos(yaw) * dx + Math.sin(yaw) * dz
    z += -Math.sin(yaw) * dx + Math.cos(yaw) * dz
  }
  return { motion, actor, sourceFrame, translation: [x - Math.cos(yaw) * root[0] - Math.sin(yaw) * root[1], 0, z + Math.sin(yaw) * root[0] - Math.cos(yaw) * root[1]], yaw }
}

export function validateTimeline(value: unknown, actorCount: number, sourceFrames: number, fps: number): DirectorTimeline {
  const fail = () => { throw new Error('Invalid director timeline.') }
  if (!value || typeof value !== 'object') return fail()
  const t = value as DirectorTimeline
  if (t.version !== 1 || t.fps !== fps || !Number.isInteger(t.frameCount) || t.frameCount < 1 || t.frameCount > fps * 180 || !Array.isArray(t.actors) || t.actors.length !== actorCount) return fail()
  const actors = new Set<number>(), ids = new Set<string>()
  for (const track of t.actors) {
    if (!Number.isInteger(track.actor) || track.actor < 0 || track.actor >= actorCount || actors.has(track.actor) || typeof track.name !== 'string' || track.name.length > 80 || !Array.isArray(track.clips) || !track.clips.length || track.clips.length > 64) return fail()
    actors.add(track.actor)
    let end = 0
    for (const clip of [...track.clips].sort((a, b) => a.startFrame - b.startFrame)) {
      if (!clip || !['saved', 'walk', 'idle'].includes(clip.kind) || typeof clip.id !== 'string' || ids.has(clip.id) || typeof clip.prompt !== 'string' || clip.prompt.length > 2000 || typeof clip.native !== 'boolean' || !Number.isFinite(clip.yaw)) return fail()
      ids.add(clip.id)
      if (clip.walkPhaseFrame !== undefined && (!Number.isSafeInteger(clip.walkPhaseFrame) || clip.walkPhaseFrame < 0 || clip.walkPhaseFrame > fps * 180)) return fail()
      if (![clip.startFrame, clip.endFrame, clip.sourceStartFrame, clip.sourceEndFrame].every(Number.isInteger) || clip.startFrame < end || clip.endFrame <= clip.startFrame || clip.endFrame > t.frameCount || clip.sourceStartFrame < 0 || clip.sourceEndFrame < clip.sourceStartFrame || clip.sourceEndFrame >= sourceFrames) return fail()
      for (const point of [clip.from, clip.to]) if (!Array.isArray(point) || point.length !== 2 || !point.every(n => Number.isFinite(n) && Math.abs(n) <= 1000)) return fail()
      end = clip.endFrame
    }
  }
  return structuredClone(t)
}
