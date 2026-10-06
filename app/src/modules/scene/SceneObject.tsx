import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import { ThreeEvent, useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody, useBeforePhysicsStep, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { ObjectRenderMode, type WorldObjectAsset, type WorldObjectPhysics } from '../../types/world'
import { useSceneObjectVisual } from './useSceneObjectVisual'
import { ObjectHoverGuides } from './ObjectHoverGuides'
import { useMotionStore } from '../motion/store'
import { useDebugStore } from '../../store/debug'
import { resetBody } from './resetBody'

export const OBJECT_SCALE = 0.5
const OBJECT_AUTO_ROTATE_Y_SPEED = 0.35

const COLLIDER_WIREFRAME_COLOR = 0x00aaff

type PointerHandler = (event: ThreeEvent<PointerEvent>) => boolean
type HoverHandler = (event: ThreeEvent<PointerEvent>, objectId: string, hovering: boolean) => void
type ClickHandler = (worldPos: THREE.Vector3) => void

const _rotation = new THREE.Quaternion()
export const SCENE_OBJECT_INSTANCE_ID_KEY = 'sceneObjectInstanceId'

export interface SceneObjectHandle {
  id: string
  rigidBody: RapierRigidBody | null
  initialPosition: THREE.Vector3
  initialRotation: THREE.Quaternion
  bounds: THREE.Box3
  getFocusPoint: (target: THREE.Vector3) => THREE.Vector3
}

interface Props {
  object: WorldObjectAsset
  position: [number, number, number]
  rotation?: [number, number, number]
  scale?: [number, number, number]
  physics?: WorldObjectPhysics
  renderMode: ObjectRenderMode
  autoRotateY?: boolean
  onHover: HoverHandler
  onClick?: ClickHandler
  onPointerDown?: PointerHandler
  onPointerMove?: PointerHandler
  onPointerUp?: PointerHandler
  onPointerCancel?: PointerHandler
  onSelect?: (event: ThreeEvent<MouseEvent>) => void
  onEditTarget?: (group: THREE.Group | null) => void
  showGuides?: boolean
  transforming?: boolean
}

export const SceneObject = forwardRef<SceneObjectHandle, Props>(function SceneObject(
  {
    object,
    position,
    rotation = [0, 0, 0],
    scale = [1, 1, 1],
    physics = 'rigidbody',
    renderMode,
    autoRotateY = false,
    onHover,
    onClick,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onSelect,
    onEditTarget,
    showGuides = false,
    transforming = false,
  },
  ref,
) {
  const rigidBodyRef = useRef<RapierRigidBody>(null)
  const visualGroupRef = useRef<THREE.Group>(null)
  const colliderProxyRef = useRef<THREE.Mesh>(null)
  const editGroupRef = useRef<THREE.Group>(null)
  const lastReset = useRef({ scene: useMotionStore.getState().sceneResetToken, object: useDebugStore.getState().objectResetToken })
  const isStatic = physics === 'static' || physics === 'ghost'
  const usesBoxCollider = physics === 'rigidbody' || physics === 'static'
  const initialPosition = useMemo(() => new THREE.Vector3(...position), [position[0], position[1], position[2]])
  const initialRotation = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), [rotation[0], rotation[1], rotation[2]])
  const { scene, wireframeOverlayScene, offset, size, bounds } = useSceneObjectVisual({
    asset: object,
    renderMode,
  })
  const colliderCenter = useMemo(
    () => new THREE.Vector3(0, (size.y * OBJECT_SCALE) / 2, 0),
    [size],
  )
  const colliderUserData = useMemo(() => ({
    [SCENE_OBJECT_INSTANCE_ID_KEY]: object.id,
    editableObjectInstanceId: object.id,
  }), [object.id])
  const colliderHalfExtents = useMemo(
    () => new THREE.Vector3(
      Math.max((size.x * OBJECT_SCALE) / 2, 0.01),
      Math.max((size.y * OBJECT_SCALE) / 2, 0.01),
      Math.max((size.z * OBJECT_SCALE) / 2, 0.01),
    ),
    [size],
  )
  const colliderWireframeMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: COLLIDER_WIREFRAME_COLOR,
    wireframe: true,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  }), [])

  useFrame((_, delta) => {
    if (!autoRotateY || !visualGroupRef.current) return
    visualGroupRef.current.rotation.y += delta * OBJECT_AUTO_ROTATE_Y_SPEED
  })

  useEffect(() => {
    colliderWireframeMaterial.opacity = 0
    colliderWireframeMaterial.transparent = true
    colliderWireframeMaterial.depthTest = false
    colliderWireframeMaterial.depthWrite = false
    colliderWireframeMaterial.needsUpdate = true
  }, [colliderWireframeMaterial])

  useEffect(() => {
    const body = rigidBodyRef.current
    if (!body) return
    body.setTranslation({ x: position[0], y: position[1], z: position[2] }, true)
    _rotation.setFromEuler(new THREE.Euler(...rotation))
    body.setRotation({ x: _rotation.x, y: _rotation.y, z: _rotation.z, w: _rotation.w }, true)
    body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    body.wakeUp()
  }, [position[0], position[1], position[2], rotation[0], rotation[1], rotation[2], scale[0], scale[1], scale[2]])

  useBeforePhysicsStep(() => {
    const scene = useMotionStore.getState().sceneResetToken
    const object = useDebugStore.getState().objectResetToken
    if (scene === lastReset.current.scene && object === lastReset.current.object) return
    lastReset.current = { scene, object }
    if (rigidBodyRef.current) resetBody(rigidBodyRef.current, initialPosition, initialRotation)
  })

  useEffect(() => {
    onEditTarget?.(editGroupRef.current)
    return () => onEditTarget?.(null)
  }, [onEditTarget])

  useEffect(() => {
    return () => {
      colliderWireframeMaterial.dispose()
    }
  }, [colliderWireframeMaterial])

  useImperativeHandle(
    ref,
    () => ({
      id: object.id,
      get rigidBody() {
        return rigidBodyRef.current
      },
      initialPosition,
      initialRotation,
      bounds,
      getFocusPoint: (target) => {
        if (colliderProxyRef.current) return colliderProxyRef.current.getWorldPosition(target)
        return target.copy(initialPosition).add(colliderCenter)
      },
    }),
    [bounds, colliderCenter, initialPosition, initialRotation, object.id],
  )

  const visualContent = (
    <group ref={visualGroupRef} scale={OBJECT_SCALE}>
      <primitive object={scene} position={offset} dispose={null} />
      {renderMode === ObjectRenderMode.ShadedWireframe && (
        <primitive object={wireframeOverlayScene} position={offset} dispose={null} />
      )}
    </group>
  )

  return (
    <RigidBody
      ref={rigidBodyRef}
      type={isStatic || transforming ? 'fixed' : 'dynamic'}
      colliders={false}
      position={position}
      rotation={rotation}
      linearDamping={0.45}
      angularDamping={0.35}
      additionalSolverIterations={4}
      ccd
      canSleep
    >
      {usesBoxCollider && (
        <CuboidCollider
          args={[
            colliderHalfExtents.x * scale[0],
            colliderHalfExtents.y * scale[1],
            colliderHalfExtents.z * scale[2],
          ]}
          position={[colliderCenter.x * scale[0], colliderCenter.y * scale[1], colliderCenter.z * scale[2]]}
        />
      )}
      <group ref={editGroupRef} scale={scale}>
      <mesh
        ref={colliderProxyRef}
        position={colliderCenter}
        material={colliderWireframeMaterial}
        renderOrder={10000}
        userData={colliderUserData}
        onPointerOver={(event) => {
          event.stopPropagation()
          onHover(event, object.id, true)
        }}
        onPointerOut={(event) => {
          event.stopPropagation()
          onHover(event, object.id, false)
        }}
        onClick={(event) => {
          event.stopPropagation()
          onClick?.(event.point.clone())
          onSelect?.(event)
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.stopPropagation()
          onPointerDown?.(event)
        }}
        onPointerMove={(event) => {
          onHover(event, object.id, true)
          onPointerMove?.(event)
        }}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <boxGeometry args={[
          colliderHalfExtents.x * 2,
          colliderHalfExtents.y * 2,
          colliderHalfExtents.z * 2,
        ]} />
      </mesh>
      {visualContent}
      {showGuides && <ObjectHoverGuides size={[size.x * OBJECT_SCALE, size.y * OBJECT_SCALE, size.z * OBJECT_SCALE]} />}
      </group>
    </RigidBody>
  )
})
