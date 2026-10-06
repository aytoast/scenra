import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import { decodeCoreSkin, decodeSavedMotion, type SavedMotionManifest } from './stageonData'
import { blockingMotion } from './blockingMotion'
import { approachTimeline, clipRoot, originalTimeline, removeDemoIntro, restoreActorClips, rootAt, sampleActor, splitActorClip, validateTimeline } from './directorTimeline'
import { BODY_PARTS, bodyPartPose } from './bodyParts'
import { CORE_PARENT_INDICES } from './coreSkeleton'

const assets = new URL('../../../public/stageon/', import.meta.url)
const buffer = (name: string) => { const value = readFileSync(new URL(name, assets)); return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) }
const manifest = JSON.parse(readFileSync(new URL('fight-fall.json', assets), 'utf8')) as SavedMotionManifest
const saved = decodeSavedMotion(manifest, buffer('fight-fall.bin'))
const skin = decodeCoreSkin(buffer('core-skin.bin'))
const library = { saved, walk: blockingMotion(skin, true), idle: blockingMotion(skin, false) }

describe('director actor timeline with real saved assets', () => {
  it('restores only selected actor while retaining other edits, name and shot duration', () => {
    const original = originalTimeline(saved), edited = structuredClone(original)
    edited.frameCount = 300
    edited.actors[0].name = 'Protagonist'
    edited.actors[0].clips[0].kind = 'walk'
    edited.actors[0].clips[0].native = false
    edited.actors[0].clips[0].to = [3, 4]
    edited.actors[1].name = 'Partner'
    edited.actors[1].clips[0] = { ...edited.actors[1].clips[0], yaw: 0.4, endFrame: 300, prompt: 'Hold partner in frame.' }
    const snapshot = structuredClone(edited)
    let id = 0
    const restored = restoreActorClips(edited, original, 0, () => `restored-${id++}`)
    expect(restored.frameCount).toBe(300)
    expect(restored.actors[0].name).toBe('Protagonist')
    expect(restored.actors[0].clips).toEqual(original.actors[0].clips.map(clip => ({ ...clip, id: 'restored-0' })))
    expect(restored.actors[1]).toEqual(snapshot.actors[1])
    expect(edited).toEqual(snapshot)
    expect(original).toEqual(originalTimeline(saved))
    expect(validateTimeline(restored, 2, 240, 20)).toEqual(restored)
  })
  it('restores with fresh IDs even if another actor uses an original clip ID', () => {
    const original = originalTimeline(saved), edited = structuredClone(original)
    edited.actors[0].clips[0].id = 'edited-a'
    edited.actors[1].clips[0].id = 'take-0'
    const restored = restoreActorClips(edited, original, 0, () => 'fresh-a')
    expect(restored.actors[0].clips[0].id).toBe('fresh-a')
    expect(restored.actors[1].clips[0].id).toBe('take-0')
    expect(validateTimeline(restored, 2, 240, 20)).toEqual(restored)
    expect(() => restoreActorClips(edited, original, 0, () => 'take-0')).toThrow('Restored clips need unique IDs.')
  })
  it('splits walking without changing gait, facing or joint positions on any frame', () => {
    const clip = { ...originalTimeline(saved).actors[0].clips[0], kind: 'walk' as const, native: false, startFrame: 240, endFrame: 280, from: [0, 0] as [number, number], to: [2, 1] as [number, number], yaw: 0.3 }
    for (const phase of [undefined, 7]) for (const splitFrame of [241, 245, 278]) for (const to of [[2, 1], [.005, .002]] as [number, number][]) {
      const original = { ...clip, to, walkPhaseFrame: phase }
      const [left, right] = splitActorClip(original, 0, splitFrame, saved, 'walk-right')
      const remaining = splitFrame < 257 ? splitActorClip(right, 0, 257, saved, 'walk-final') : [right]
      const beforeTrack = { actor: 0, name: 'Walker', clips: [original] }
      const afterTrack = { actor: 0, name: 'Walker', clips: [left, ...remaining] }
      expect(right.walkPhaseFrame).toBe((phase ?? 0) + splitFrame - 240)
      if (splitFrame < 257) expect(remaining[1].walkPhaseFrame).toBe((phase ?? 0) + 17)
      expect(sampleActor(library, afterTrack, splitFrame).sourceFrame).toBe(((phase ?? 0) + splitFrame - 240) % library.walk.manifest.frameCount)
      const sequence = originalTimeline(saved)
      sequence.frameCount = 280
      sequence.actors[0] = afterTrack
      const roundTrip = validateTimeline(JSON.parse(JSON.stringify(sequence)), 2, 240, 20)
      for (let frame = 240; frame < 280; frame++) {
        const before = sampleActor(library, beforeTrack, frame), after = sampleActor(library, roundTrip.actors[0], frame)
        expect(after.sourceFrame).toBe(before.sourceFrame)
        expect(after.yaw).toBeCloseTo(before.yaw, 12)
        expect(after.translation[0]).toBeCloseTo(before.translation[0], 12)
        expect(after.translation[2]).toBeCloseTo(before.translation[2], 12)
        for (let joint = 0; joint < library.walk.manifest.jointCount; joint++) {
          const worldJoint = (sample: typeof before) => new Vector3().fromArray(sample.motion.positions, (sample.sourceFrame * 27 + joint) * 3).applyAxisAngle(new Vector3(0, 1, 0), sample.yaw).add(new Vector3(...sample.translation))
          expect(worldJoint(after).distanceTo(worldJoint(before))).toBeLessThan(1e-6)
        }
      }
    }
  })
  it('accepts old walk clips and rejects invalid optional phase values', () => {
    const legacy = originalTimeline(saved)
    legacy.actors[0].clips[0].kind = 'walk'
    expect(validateTimeline(legacy, 2, 240, 20).actors[0].clips[0].walkPhaseFrame).toBeUndefined()
    for (const phase of [-1, 0.5, NaN, Infinity, 3601]) {
      const invalid = structuredClone(legacy)
      invalid.actors[0].clips[0].walkPhaseFrame = phase
      expect(() => validateTimeline(invalid, 2, 240, 20)).toThrow('Invalid director timeline.')
    }
  })
  it('removes old demo walk prelude while preserving edited fight clip', () => {
    const old = approachTimeline(saved)
    old.actors[0].clips[1].yaw = 0.4
    const clean = removeDemoIntro(old)
    expect(clean.frameCount).toBe(240)
    expect(clean.actors[0].clips).toHaveLength(1)
    expect(clean.actors[0].clips[0]).toMatchObject({ kind: 'saved', startFrame: 0, endFrame: 240, yaw: 0.4 })
    expect(sampleActor(library, clean.actors[0], 0).sourceFrame).toBe(0)
  })
  it('keeps original take intact, including last frame', () => {
    const t = originalTimeline(saved)
    for (const frame of [0, 120, 239]) for (const track of t.actors) {
      const sample = sampleActor(library, track, frame)
      expect(sample.motion).toBe(saved); expect(sample.sourceFrame).toBe(frame); expect(sample.translation).toEqual([0, 0, 0])
    }
  })
  it('joins approach to saved root position and colliders use same transformed joints', () => {
    const t = approachTimeline(saved), track = t.actors[0]
    expect(clipRoot(track.clips[0], 0, 59, saved)).toEqual(rootAt(saved, 0, 0))
    for (const frame of [0, 20, 59, 60, 180]) {
      const sample = sampleActor(library, track, frame), part = BODY_PARTS[0]
      const pose = bodyPartPose(sample.motion, sample.actor, part, sample.sourceFrame / sample.motion.manifest.fps, [0, 0, 0], { position: new Vector3(), rotation: new Quaternion(), halfLength: 0 })
      const rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), sample.yaw)
      pose.position.applyQuaternion(rotation).add(new Vector3(...sample.translation))
      const p = sample.motion.positions, base = (sample.actor * sample.motion.manifest.frameCount + sample.sourceFrame) * 27 * 3
      const midpoint = new Vector3().fromArray(p, base + part.start * 3).add(new Vector3().fromArray(p, base + part.end * 3)).multiplyScalar(.5).applyQuaternion(rotation).add(new Vector3(...sample.translation))
      expect(pose.position.distanceTo(midpoint)).toBeLessThan(1e-6)
    }
  })
  it('splits retimed anchored take without losing native root displacement', () => {
    const track = originalTimeline(saved).actors[0], original = { ...track.clips[0], native: false, from: [3, 2] as [number, number], to: [4, 3] as [number, number], yaw: 0.3 }
    const [left, right] = splitActorClip(original, 0, 120, saved, 'right')
    for (const [clip, frame] of [[left, 119], [right, 120], [right, 239]] as const) {
      const before = clipRoot(original, 0, frame, saved), after = clipRoot(clip, 0, frame, saved)
      expect(Math.hypot(before[0] - after[0], before[1] - after[1])).toBeLessThan(1e-6)
    }
    expect(left.sourceEndFrame).toBe(119); expect(right.sourceStartFrame).toBe(120)
  })
  it('preserves rig bone lengths throughout local walking cycle', () => {
    const walk = library.walk
    for (let frame = 0; frame < walk.manifest.frameCount; frame++) for (let joint = 1; joint < 27; joint++) {
      const parent = CORE_PARENT_INDICES[joint], p = walk.positions
      const length = (at: number) => new Vector3().fromArray(p, (at * 27 + joint) * 3).distanceTo(new Vector3().fromArray(p, (at * 27 + parent) * 3))
      expect(length(frame)).toBeCloseTo(length(0), 5)
    }
    expect([...walk.rotations].every(Number.isFinite)).toBe(true)
  })
  it('rejects unsafe imports and overlapping actor clips', () => {
    const t = approachTimeline(saved)
    expect(validateTimeline(t, 2, 240, 20)).toEqual(t)
    for (const mutate of [(copy: typeof t) => { copy.actors[0].clips[0].from[0] = NaN }, (copy: typeof t) => { copy.actors[0].clips[1].startFrame = 30 }, (copy: typeof t) => { copy.frameCount = 20 * 181 }, (copy: typeof t) => { copy.actors[1].actor = 0 }]) {
      const invalid = structuredClone(t); mutate(invalid)
      expect(() => validateTimeline(invalid, 2, 240, 20)).toThrow('Invalid director timeline.')
    }
  })
})
