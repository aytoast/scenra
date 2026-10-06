import { describe, expect, it } from 'vitest'
import { CAMERA_EYE_OFFSET, CHARACTER_BODY_SPAWN, resolvePlayerSpawn } from './spawn'

describe('player spawn', () => {
  it('converts camera eye position into capsule center and preserves facing', () => {
    expect(resolvePlayerSpawn({ position: [2, 1.9, 3.2], yaw: Math.PI / 2 })).toEqual({
      body: { x: 2, y: 1.9 - CAMERA_EYE_OFFSET, z: 3.2 }, yaw: Math.PI / 2,
    })
  })

  it('uses safe default when saved spawn contains invalid numbers', () => {
    expect(resolvePlayerSpawn({ position: [NaN, 1, 3], yaw: Infinity })).toEqual({ body: CHARACTER_BODY_SPAWN, yaw: 0 })
    expect(resolvePlayerSpawn()).toEqual({ body: CHARACTER_BODY_SPAWN, yaw: 0 })
  })
})
