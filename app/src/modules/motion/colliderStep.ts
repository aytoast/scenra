import type { RapierRigidBody } from '@react-three/rapier'
import type { Quaternion, Vector3 } from 'three'

type MotionBody = Pick<RapierRigidBody, 'setTranslation' | 'setRotation' | 'setLinvel' | 'setAngvel' | 'setNextKinematicTranslation' | 'setNextKinematicRotation'>

/** Teleport on timeline seeks, then resolve contact at pose without sweep velocity. */
export function moveMotionCollider(body: MotionBody, position: Vector3, rotation: Quaternion, discontinuous: boolean) {
  if (discontinuous) {
    body.setTranslation(position, false)
    body.setRotation(rotation, false)
    body.setLinvel({ x: 0, y: 0, z: 0 }, false)
    body.setAngvel({ x: 0, y: 0, z: 0 }, false)
  }
  body.setNextKinematicTranslation(position)
  body.setNextKinematicRotation(rotation)
}
