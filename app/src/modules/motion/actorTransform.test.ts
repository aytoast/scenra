import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { transformActorClip } from './actorTransform'
import { clipRoot, originalTimeline, sampleActor, type ActorClip, type Point } from './directorTimeline'
import { decodeSavedMotion, type SavedMotionManifest } from './stageonData'

const assets = new URL('../../../public/stageon/', import.meta.url)
const bytes = readFileSync(new URL('fight-fall.bin', assets))
const manifest = JSON.parse(readFileSync(new URL('fight-fall.json', assets), 'utf8')) as SavedMotionManifest
const saved = decodeSavedMotion(manifest, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
const original = originalTimeline(saved)
const closePoint = (actual: Point, expected: Point) => {
  expect(actual[0]).toBeCloseTo(expected[0], 6)
  expect(actual[1]).toBeCloseTo(expected[1], 6)
}

describe('actor viewport transforms with saved motion', () => {
  it('moves native motion without changing source timing or recorded path', () => {
    const clip = { ...original.actors[1].clips[0], yaw: .3, sourceStartFrame: 30, sourceEndFrame: 200 }
    const moved = transformActorClip(clip, 1, 83, saved, [1.2, -.7])
    expect(moved.native).toBe(false)
    expect(moved.sourceStartFrame).toBe(30)
    expect(moved.sourceEndFrame).toBe(200)
    for (let frame = 0; frame < clip.endFrame; frame++) {
      const before = clipRoot(clip, 1, frame, saved)
      closePoint(clipRoot(moved, 1, frame, saved), [before[0] + 1.2, before[1] - .7])
    }
  })

  it('turns native actor around current root without changing its pose frame', () => {
    const clip = original.actors[0].clips[0]
    const turned = transformActorClip(clip, 0, 73, saved, [0, 0], .6)
    closePoint(clipRoot(turned, 0, 73, saved), clipRoot(clip, 0, 73, saved))
    const library = { saved, walk: saved, idle: saved }
    const before = sampleActor(library, { actor: 0, name: 'Actor', clips: [clip] }, 73)
    const after = sampleActor(library, { actor: 0, name: 'Actor', clips: [turned] }, 73)
    expect(after.sourceFrame).toBe(before.sourceFrame)
    expect(after.motion).toBe(before.motion)
    expect(after.yaw - before.yaw).toBeCloseTo(.6)
  })

  it('keeps anchored blocking drift while moving and turning saved clip', () => {
    const clip: ActorClip = { ...original.actors[0].clips[0], native: false, from: [2, 3], to: [4, 5], yaw: -.2 }
    const next = transformActorClip(clip, 0, 120, saved, [.4, -.8], .7)
    const before = clipRoot(clip, 0, 120, saved)
    closePoint(clipRoot(next, 0, 120, saved), [before[0] + .4, before[1] - .8])
    closePoint([next.to[0] - next.from[0], next.to[1] - next.from[1]], [2, 2])
    expect(next.startFrame).toBe(clip.startFrame)
    expect(next.endFrame).toBe(clip.endFrame)
  })

  it('turns local walk without rotating blocking endpoints or doubling facing', () => {
    const clip: ActorClip = { ...original.actors[0].clips[0], kind: 'walk', native: false, from: [1, 2], to: [3, 4], yaw: .1 }
    const next = transformActorClip(clip, 0, 80, saved, [0, 0], .4)
    expect(next.from).toEqual(clip.from)
    expect(next.to).toEqual(clip.to)
    closePoint(clipRoot(next, 0, 80, saved), clipRoot(clip, 0, 80, saved))
    const library = { saved, walk: saved, idle: saved }
    const before = sampleActor(library, { actor: 0, name: 'Actor', clips: [clip] }, 80)
    const after = sampleActor(library, { actor: 0, name: 'Actor', clips: [next] }, 80)
    expect(after.yaw - before.yaw).toBeCloseTo(.4)
    expect(after.sourceFrame).toBe(before.sourceFrame)
  })

  it('keeps no-op native selection intact and rejects invalid transforms', () => {
    const clip = original.actors[0].clips[0]
    expect(transformActorClip(clip, 0, 0, saved, [0, 0])).toEqual(clip)
    expect(() => transformActorClip(clip, 0, 0, saved, [Infinity, 0])).toThrow('Actor transform must use finite coordinates.')
    expect(() => transformActorClip(clip, 0, 0, saved, [0, 0], NaN)).toThrow('Actor transform must use finite coordinates.')
  })
})
