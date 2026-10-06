import { Matrix4, Quaternion, Vector3 } from 'three'
import { CORE_PARENT_INDICES, poseToCoreJoints } from './coreSkeleton'
import type { CoreSkin, SavedMotion } from './stageonData'

/** Port of Stageon fixture walkingPose and CoreSkin preview; this is local blocking, not model inference. */
export function blockingMotion(skin: CoreSkin, walking: boolean): SavedMotion {
  const frameCount = walking ? 40 : 1, jointCount = skin.jointCount
  const positions = new Float32Array(frameCount * jointCount * 3)
  const rotations = new Float32Array(frameCount * jointCount * 9)
  const bind = skin.inverseBind.map(matrix => matrix.clone().invert())
  const rest = bind.map(matrix => new Vector3().setFromMatrixPosition(matrix))
  const children = CORE_PARENT_INDICES.map((_, index) => CORE_PARENT_INDICES.indexOf(index))
  for (let frame = 0; frame < frameCount; frame++) {
    const cycle = walking ? Math.sin(frame / 20 * Math.PI * 2) : 0
    const joints = poseToCoreJoints({ root: [0, 0, 0], pelvisHeight: 0.96962255 + Math.abs(cycle) * 0.025, torsoPitch: walking ? 0.03 : 0,
      leftHip: cycle * 0.5, rightHip: -cycle * 0.5, leftKnee: Math.max(0, -cycle) * 0.65, rightKnee: Math.max(0, cycle) * 0.65,
      leftShoulder: -cycle * 0.4, rightShoulder: cycle * 0.4, leftElbow: -0.2, rightElbow: -0.2 }).map(p => new Vector3(...p))
    const deltas: Quaternion[] = []
    for (let joint = 0; joint < jointCount; joint++) {
      const child = children[joint], parent = CORE_PARENT_INDICES[joint]
      const delta = child >= 0 ? new Quaternion().setFromUnitVectors(rest[child].clone().sub(rest[joint]).normalize(), joints[child].clone().sub(joints[joint]).normalize()) : parent >= 0 ? deltas[parent].clone() : new Quaternion()
      deltas.push(delta)
      const rotation = delta.clone().multiply(new Quaternion().setFromRotationMatrix(bind[joint]))
      const matrix = new Matrix4().makeRotationFromQuaternion(rotation).elements
      const p = (frame * jointCount + joint) * 3, r = (frame * jointCount + joint) * 9
      positions.set(joints[joint].toArray(), p)
      rotations.set([matrix[0], matrix[4], matrix[8], matrix[1], matrix[5], matrix[9], matrix[2], matrix[6], matrix[10]], r)
    }
  }
  return { manifest: { version: 1, name: walking ? 'Stageon blocking walk' : 'Stageon blocking hold', fps: 20, actorCount: 1, frameCount, jointCount, data: '' }, positions, rotations }
}
