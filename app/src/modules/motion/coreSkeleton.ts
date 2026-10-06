import type { JointPose, MotionSkeleton, Vec3 } from './types'

export const CORE_JOINT_NAMES = [
  'Hips',
  'Spine',
  'Spine1',
  'Spine2',
  'Spine3',
  'Neck',
  'Head',
  'RightShoulder',
  'RightArm',
  'RightForeArm',
  'RightHand',
  'RightHandEnd',
  'RightHandThumb1',
  'LeftShoulder',
  'LeftArm',
  'LeftForeArm',
  'LeftHand',
  'LeftHandEnd',
  'LeftHandThumb1',
  'RightUpLeg',
  'RightLeg',
  'RightFoot',
  'RightToeBase',
  'LeftUpLeg',
  'LeftLeg',
  'LeftFoot',
  'LeftToeBase',
] as const

export const CORE_PARENT_INDICES = [
  -1, 0, 1, 2, 3, 4, 5, 4, 7, 8, 9, 10, 10, 4, 13, 14, 15, 16, 16, 0, 19, 20, 21, 0, 23, 24, 25,
]

export const CORE_SKELETON: MotionSkeleton = {
  name: 'CoreSkeleton27',
  jointNames: [...CORE_JOINT_NAMES],
  parentIndices: CORE_PARENT_INDICES,
}

// Global bind positions from ARDY skin_standard.npz. Fixture animation rotates
// these offsets, so generated poses retain official CoreSkin proportions.
export const CORE_BIND_POSITIONS: Vec3[] = [
  [0, 0.96962255, 0],
  [0.00000001, 1.04061162, -0.04732576],
  [0.00000001, 1.13382554, -0.06376223],
  [0.00000001, 1.22811806, -0.07201178],
  [0.00000001, 1.32277012, -0.07201187],
  [0.00000001, 1.57123232, -0.03651798],
  [0.00000001, 1.69940186, -0.01391793],
  [-0.03199489, 1.49554288, -0.01868719],
  [-0.19090286, 1.495543, -0.01868719],
  [-0.48633927, 1.495543, -0.0186872],
  [-0.71899116, 1.49554324, -0.0186872],
  [-0.78860265, 1.49554324, -0.0186872],
  [-0.75170797, 1.49600041, 0.01311064],
  [0.0319949, 1.49554288, -0.01868719],
  [0.19090289, 1.49554288, -0.01868719],
  [0.48633927, 1.49554288, -0.01868719],
  [0.71899116, 1.49554288, -0.01868719],
  [0.78860265, 1.49554288, -0.01868719],
  [0.75170797, 1.49600017, 0.01311064],
  [-0.09491818, 0.9418937, 0],
  [-0.09491818, 0.52977562, -0.00000002],
  [-0.09491815, 0.07368419, -0.00000001],
  [-0.09491815, 0.01520913, 0.16065837],
  [0.09491821, 0.9418937, 0],
  [0.09491823, 0.52977562, -0.00000002],
  [0.09491825, 0.07368419, -0.00000001],
  [0.09491824, 0.01520912, 0.1606584],
]

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function rotateX(vector: Vec3, angle: number): Vec3 {
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  return [
    vector[0],
    vector[1] * cosine - vector[2] * sine,
    vector[1] * sine + vector[2] * cosine,
  ]
}

function rotateZ(vector: Vec3, angle: number): Vec3 {
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  return [
    vector[0] * cosine - vector[1] * sine,
    vector[0] * sine + vector[1] * cosine,
    vector[2],
  ]
}

function bindOffset(parentIndex: number, jointIndex: number): Vec3 {
  return subtract(CORE_BIND_POSITIONS[jointIndex], CORE_BIND_POSITIONS[parentIndex])
}

function place(parent: Vec3, parentIndex: number, jointIndex: number, rotate: (offset: Vec3) => Vec3): Vec3 {
  return add(parent, rotate(bindOffset(parentIndex, jointIndex)))
}

function armOffset(parentIndex: number, jointIndex: number, side: 'left' | 'right', angle: number): Vec3 {
  const restDrop = side === 'right' ? Math.PI / 2 : -Math.PI / 2
  return rotateX(rotateZ(bindOffset(parentIndex, jointIndex), restDrop), angle)
}

export function poseToCoreJoints(pose: JointPose): Vec3[] {
  const joints = Array.from({ length: CORE_JOINT_NAMES.length }, () => [0, 0, 0] as Vec3)
  joints[0] = [pose.root[0], pose.root[1] + pose.pelvisHeight, pose.root[2]]

  const torso = (offset: Vec3) => rotateX(offset, pose.torsoPitch)
  for (let jointIndex = 1; jointIndex <= 6; jointIndex += 1) {
    const parentIndex = CORE_PARENT_INDICES[jointIndex]
    joints[jointIndex] = place(joints[parentIndex], parentIndex, jointIndex, torso)
  }

  for (const [shoulder, arm, forearm, hand, handEnd, thumb, side, shoulderAngle, elbowAngle] of [
    [7, 8, 9, 10, 11, 12, 'right', pose.rightShoulder, pose.rightElbow],
    [13, 14, 15, 16, 17, 18, 'left', pose.leftShoulder, pose.leftElbow],
  ] as const) {
    joints[shoulder] = place(joints[4], 4, shoulder, torso)
    joints[arm] = place(joints[shoulder], shoulder, arm, torso)
    joints[forearm] = add(joints[arm], armOffset(arm, forearm, side, shoulderAngle))
    joints[hand] = add(joints[forearm], armOffset(forearm, hand, side, shoulderAngle + elbowAngle))
    joints[handEnd] = add(joints[hand], armOffset(hand, handEnd, side, shoulderAngle + elbowAngle))
    joints[thumb] = add(joints[hand], armOffset(hand, thumb, side, shoulderAngle + elbowAngle))
  }

  for (const [upLeg, leg, foot, toe, hipAngle, kneeAngle] of [
    [19, 20, 21, 22, pose.rightHip, pose.rightKnee],
    [23, 24, 25, 26, pose.leftHip, pose.leftKnee],
  ] as const) {
    joints[upLeg] = place(joints[0], 0, upLeg, (offset) => offset)
    joints[leg] = place(joints[upLeg], upLeg, leg, (offset) => rotateX(offset, hipAngle))
    joints[foot] = place(joints[leg], leg, foot, (offset) => rotateX(offset, hipAngle + kneeAngle))
    joints[toe] = place(joints[foot], foot, toe, (offset) => rotateX(offset, hipAngle + kneeAngle))
  }

  return joints
}
