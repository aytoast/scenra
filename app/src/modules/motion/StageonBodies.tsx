import { useMemo, useRef, type RefObject } from 'react'
import { CapsuleCollider, RigidBody, interactionGroups, useBeforePhysicsStep, type RapierCollider, type RapierRigidBody } from '@react-three/rapier'
import { Quaternion, Vector3 } from 'three'
import { BODY_PARTS, bodyPartPose } from './bodyParts'
import { useMotionStore } from './store'
import { activeClip, sampleActor, type MotionLibrary } from './directorTimeline'
import type { Vec3Tuple } from '../../types/world'
import { moveMotionCollider } from './colliderStep'

export function MotionColliders({ library, position, clock }: { library: MotionLibrary; position: Vec3Tuple; clock: RefObject<number> }) {
  return <>{Array.from({ length: library.saved.manifest.actorCount }, (_, actor) => BODY_PARTS.map((part) => <BodyPart key={`${actor}-${part.name}`} library={library} actor={actor} part={part} offset={position} clock={clock} />))}</>
}

function BodyPart({ library, actor, part, offset, clock }: { library: MotionLibrary; actor: number; part: typeof BODY_PARTS[number]; offset: Vec3Tuple; clock: RefObject<number> }) {
  const body = useRef<RapierRigidBody>(null)
  const collider = useRef<RapierCollider>(null)
  const previous = useRef({ time: -1, seek: -1, enabled: false, clip: '' })
  const pose = useMemo(() => ({ position: new Vector3(), rotation: new Quaternion(), halfLength: 0 }), [])
  const initial = useMemo(() => bodyPartPose(library.saved, actor, part, 0, offset, { position: new Vector3(), rotation: new Quaternion(), halfLength: 0 }), [library, actor, part, offset])
  const yawRotation = useMemo(() => new Quaternion(), [])
  const vertical = useMemo(() => new Vector3(0, 1, 0), [])
  useBeforePhysicsStep(() => {
    if (!body.current || !collider.current) return
    const state = useMotionStore.getState()
    const enabled = state.visible && state.collisions && !document.hidden
    body.current.setEnabled(enabled)
    if (!enabled) { previous.current.enabled = false; return }
    const time = clock.current
    const track = state.timeline?.actors.find(item => item.actor === actor)
    if (!track) return
    const sample = sampleActor(library, track, state.frame)
    const clip = activeClip(track, state.frame).id
    bodyPartPose(sample.motion, sample.actor, part, sample.sourceFrame / sample.motion.manifest.fps, [0, 0, 0], pose)
    yawRotation.setFromAxisAngle(vertical, sample.yaw)
    pose.position.applyQuaternion(yawRotation)
    pose.position.x += offset[0] + sample.translation[0]
    pose.position.y += offset[1] + sample.translation[1]
    pose.position.z += offset[2] + sample.translation[2]
    pose.rotation.premultiply(yawRotation)
    collider.current.setHalfHeight(pose.halfLength)
    // Seeking, looping, or returning from hidden state must not sweep through props.
    const discontinuous = !previous.current.enabled || previous.current.clip !== clip || state.seekToken !== previous.current.seek || time < previous.current.time || time - previous.current.time > 0.15
    moveMotionCollider(body.current, pose.position, pose.rotation, discontinuous)
    previous.current = { time, seek: state.seekToken, enabled: true, clip }
  })
  return <RigidBody ref={body} type="kinematicPosition" position={initial.position.toArray()} colliders={false} ccd userData={{ stageonPhysicsActor: actor, bodyPart: part.name }}>
    <CapsuleCollider ref={collider} args={[initial.halfLength, part.radius]} friction={0.6} restitution={0.08} collisionGroups={interactionGroups(1, [0])} />
  </RigidBody>
}

