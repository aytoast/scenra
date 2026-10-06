import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { RigidBody, type RapierRigidBody } from '@react-three/rapier'
import { CanvasTexture, Mesh, Sprite, SpriteMaterial, Vector3 } from 'three'
import { type SceneObjectHandle } from '../scene/SceneObject'
import { useObjectGrab } from '../scene/useObjectGrab'
import { selectionStep, thumbstick } from './input'

type ObjectRefs = RefObject<Map<string, RefObject<SceneObjectHandle | null>>>
export function XRObjectHands({ objectRefs, eligible, names }: { objectRefs: ObjectRefs; eligible: Set<string>; names: Map<string, string> }) {
  const ownership = useMemo(() => new Map<string, number>(), [])
  return <>{[0, 1].map(index => <XRHand key={index} index={index} objectRefs={objectRefs} eligible={eligible} ownership={ownership} names={names} />)}</>
}

function XRHand({ index, objectRefs, eligible, ownership, names }: { index: number; objectRefs: ObjectRefs; eligible: Set<string>; ownership: Map<string, number>; names: Map<string, string> }) {
  const { gl } = useThree()
  const source = useRef<XRInputSource | null>(null)
  const anchor = useRef<RapierRigidBody>(null)
  const marker = useRef<Mesh>(null)
  const selected = useRef('')
  const armed = useRef(true)
  const wasPressed = useRef(false)
  const held = useRef('')
  const point = useMemo(() => new Vector3(), [])
  const controller = gl.xr.getController(index)
  const isObjectEligible = (id: string) => eligible.has(id) && (!ownership.has(id) || ownership.get(id) === index)
  const { beginControllerGrab, cancelGrab, activeGrabRef } = useObjectGrab({ anchorRef: anchor, objectRefs, isObjectEligible, desktop: false })
  const label = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 512; canvas.height = 96
    const texture = new CanvasTexture(canvas)
    const sprite = new Sprite(new SpriteMaterial({ map: texture, depthTest: false, depthWrite: false }))
    sprite.scale.set(0.42, 0.07875, 1)
    sprite.position.set(0, 0.1, -0.4)
    sprite.visible = false
    return { canvas, texture, sprite }
  }, [])
  useEffect(() => {
    const connected = (event: { data: XRInputSource }) => { source.current = event.data }
    const release = () => {
      source.current = null
      cancelGrab()
      if (held.current) ownership.delete(held.current)
      held.current = ''; wasPressed.current = false
      label.sprite.visible = false
    }
    controller.add(label.sprite)
    controller.addEventListener('connected', connected)
    controller.addEventListener('disconnected', release)
    gl.xr.addEventListener('sessionend', release)
    return () => {
      release()
      controller.removeEventListener('connected', connected)
      controller.removeEventListener('disconnected', release)
      gl.xr.removeEventListener('sessionend', release)
      label.sprite.removeFromParent()
    }
  }, [cancelGrab, controller, gl, label, ownership])
  useEffect(() => () => { label.texture.dispose(); label.sprite.material.dispose() }, [label])
  useFrame(() => {
    const stickSource = source.current
    if (marker.current) marker.current.visible = false
    if (!gl.xr.isPresenting || !stickSource?.gamepad) return
    const ids = Array.from(eligible).filter(id => !ownership.has(id) || ownership.get(id) === index)
    if (!ids.includes(selected.current)) selected.current = ids[0] ?? ''
    // Physical loop resets release joints; keep ownership in sync without re-grabbing.
    if (held.current && !activeGrabRef.current) { ownership.delete(held.current); held.current = '' }
    const input = selectionStep(thumbstick(stickSource.gamepad.axes).x, armed.current)
    armed.current = input.armed
    if (input.step && !held.current && ids.length) selected.current = ids[(ids.indexOf(selected.current) + input.step + ids.length) % ids.length]
    const handle = objectRefs.current.get(selected.current)?.current
    const pressed = Boolean(stickSource.gamepad.buttons[3]?.pressed)
    if (pressed && !wasPressed.current && handle && isObjectEligible(selected.current)) {
      handle.getFocusPoint(point)
      beginControllerGrab(controller, selected.current, point)
      if (activeGrabRef.current) { held.current = selected.current; ownership.set(selected.current, index) }
    }
    if (!pressed && wasPressed.current) {
      cancelGrab()
      if (held.current) ownership.delete(held.current)
      held.current = ''
    }
    wasPressed.current = pressed
    if (handle && marker.current) {
      handle.getFocusPoint(point)
      marker.current.position.copy(point)
      marker.current.visible = true
    }
    const text = `${stickSource.handedness.toUpperCase()} · ${names.get(selected.current) ?? 'No movable props'}`
    if (label.sprite.userData.text !== text) {
      label.sprite.userData.text = text
      const context = label.canvas.getContext('2d')!
      context.clearRect(0, 0, 512, 96)
      context.fillStyle = '#151515'; context.fillRect(0, 0, 512, 96)
      context.fillStyle = 'white'; context.font = '28px sans-serif'; context.fillText(text, 16, 57, 480)
      label.texture.needsUpdate = true
    }
    label.sprite.visible = true
  }, -0.5)
  return <>
    <RigidBody ref={anchor} type="kinematicPosition" colliders={false} position={[0, -1000, 0]} />
    <mesh ref={marker} visible={false} renderOrder={1000}>
      <sphereGeometry args={[0.09, 12, 8]} />
      <meshBasicMaterial color={index ? '#ffc677' : '#80d7f5'} wireframe depthTest={false} />
    </mesh>
  </>
}
