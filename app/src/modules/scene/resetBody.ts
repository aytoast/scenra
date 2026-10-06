import type { RapierRigidBody } from '@react-three/rapier'
import type { Quaternion, Vector3 } from 'three'

export function resetBody(body: RapierRigidBody, position: Vector3, rotation: Quaternion) {
  body.setTranslation(position, true)
  body.setRotation(rotation, true)
  body.setLinvel({ x: 0, y: 0, z: 0 }, true)
  body.setAngvel({ x: 0, y: 0, z: 0 }, true)
  body.resetForces(true)
  body.resetTorques(true)
  body.wakeUp()
}
