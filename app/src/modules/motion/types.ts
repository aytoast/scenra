export type Vec3 = [number, number, number]
export interface MotionSkeleton { name: string; jointNames: string[]; parentIndices: number[] }
export interface JointPose {
  root: Vec3; pelvisHeight: number; torsoPitch: number
  leftHip: number; rightHip: number; leftKnee: number; rightKnee: number
  leftShoulder: number; rightShoulder: number; leftElbow: number; rightElbow: number
}
