import { expect, it } from 'vitest'
import RAPIER from '@dimforge/rapier3d-compat'
import { Quaternion, Vector3 } from 'three'
import { resetBody } from './resetBody'
import { finishMotionLoop, seekMotion, useMotionStore } from '../motion/store'

it('restores physical props and clears motion, forces, and torque between takes', async () => {
  await RAPIER.init()
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
  try {
    const position = new Vector3(1, 2, -3)
    const rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.4)
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(1, 2, -3).setRotation(rotation))
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.2, 0.2, 0.2), body)
    for (let loop = 0; loop < 3; loop++) {
      body.setTranslation({ x: 10, y: 6, z: 8 }, true)
      body.setRotation(new Quaternion(), true)
      body.setLinvel({ x: 5, y: 2, z: 7 }, true)
      body.setAngvel({ x: 1, y: 3, z: 2 }, true)
      body.addForce({ x: 30, y: 10, z: 20 }, true)
      body.addTorque({ x: 8, y: 4, z: 2 }, true)
      resetBody(body, position, rotation)
      expect(body.translation()).toEqual({ x: 1, y: 2, z: -3 })
      expect(body.rotation().y).toBeCloseTo(rotation.y)
      expect(body.linvel()).toEqual({ x: 0, y: 0, z: 0 })
      expect(body.angvel()).toEqual({ x: 0, y: 0, z: 0 })
      world.step()
      expect(body.linvel().x).toBe(0)
      expect(body.linvel().z).toBe(0)
      expect(body.angvel()).toEqual({ x: 0, y: 0, z: 0 })
    }
  } finally { world.free() }
})

it('signals scene reset on loop and explicit restart, preserving playback and arbitrary seeks', () => {
  useMotionStore.setState({ sceneResetToken: 0, seekToken: 0, frame: 80, frameCount: 240, playing: false })
  finishMotionLoop()
  expect(useMotionStore.getState().sceneResetToken).toBe(1)
  seekMotion(0)
  expect(useMotionStore.getState()).toMatchObject({ sceneResetToken: 2, frame: 0, playing: false })
  seekMotion(45)
  expect(useMotionStore.getState()).toMatchObject({ sceneResetToken: 2, frame: 45 })
})

it('keeps playhead finite during loading and clamps seeks to loaded take', () => {
  useMotionStore.setState({ frameCount: 0, frame: 0 })
  seekMotion(Number.NaN)
  expect(useMotionStore.getState().frame).toBe(0)
  useMotionStore.setState({ frameCount: 240 })
  seekMotion(500)
  expect(useMotionStore.getState().frame).toBe(239)
})
