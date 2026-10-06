import { useRef, useEffect, forwardRef, useImperativeHandle, useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useCameraGestures } from '../camera/useCameraGestures'
import { cameraFocusTarget } from '../camera/cameraFocus'
import { useDebugStore } from '../../store/debug'
import { isEditableTarget } from '../../utils/dom'
import { CHARACTER_SPAWN, type PlayerSpawn } from './spawn'

export interface FlyControllerHandle {
  reset: () => void
}

interface FlyControllerProps {
  preserveCameraOnMount?: boolean
  spawn?: PlayerSpawn
  onZoom?: (delta: number) => void
}

const SPEED = 6
const FAST_MULT = 3
const SMOOTH = 0.12
const DOLLY_UNITS_PER_PIXEL = 0.02
const DEFAULT_YAW = 0

const _forward = new THREE.Vector3()
const _dollyForward = new THREE.Vector3()
const _right = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)
const _move = new THREE.Vector3()
const _euler = new THREE.Euler(0, 0, 0, 'YXZ')

export const FlyController = forwardRef<FlyControllerHandle, FlyControllerProps>(function FlyController({ preserveCameraOnMount = false, spawn, onZoom }, ref) {
  const { camera, gl } = useThree()
  const mouseSensitivity = useDebugStore((s) => s.flyMouseSensitivity)
  const keys = useRef(new Set<string>())
  const rawYaw = useRef(0)
  const rawPitch = useRef(0)
  const smoothYaw = useRef(0)
  const smoothPitch = useRef(0)
  const [spawnX, spawnY, spawnZ] = spawn?.position ?? [CHARACTER_SPAWN.x, CHARACTER_SPAWN.y, CHARACTER_SPAWN.z]
  const spawnYaw = spawn?.yaw ?? DEFAULT_YAW

  const reset = useCallback(() => {
    camera.position.set(spawnX, spawnY, spawnZ)
    cameraFocusTarget.current = null
    keys.current.clear()
    rawYaw.current = spawnYaw
    rawPitch.current = 0
    smoothYaw.current = spawnYaw
    smoothPitch.current = 0
    camera.quaternion.setFromEuler(_euler.set(0, spawnYaw, 0))
  }, [camera, spawnX, spawnY, spawnZ, spawnYaw])

  const preserveCamera = useCallback(() => {
    cameraFocusTarget.current = null
    keys.current.clear()
    _euler.setFromQuaternion(camera.quaternion, 'YXZ')
    rawYaw.current = _euler.y
    rawPitch.current = _euler.x
    smoothYaw.current = _euler.y
    smoothPitch.current = _euler.x
  }, [camera])

  const applyDolly = useCallback((deltaY: number) => {
    if (onZoom) { onZoom(deltaY); return }
    _dollyForward.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize()
    camera.position.addScaledVector(_dollyForward, -deltaY * DOLLY_UNITS_PER_PIXEL)
  }, [camera, onZoom])

  const applyPan = useCallback((dx: number, dy: number) => {
    cameraFocusTarget.current = null
    _right.set(1, 0, 0).applyQuaternion(camera.quaternion)
    _move.set(0, 1, 0).applyQuaternion(camera.quaternion)
    camera.position.addScaledVector(_right, -dx * 0.008).addScaledVector(_move, dy * 0.008)
  }, [camera])

  const applyTumble = useCallback((dx: number, dy: number) => {
    cameraFocusTarget.current = null
    rawYaw.current -= dx * mouseSensitivity
    rawPitch.current -= dy * mouseSensitivity
    rawPitch.current = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, rawPitch.current))
  }, [mouseSensitivity])

  useCameraGestures({ domElement: gl.domElement, onDollyPixels: applyDolly, onTumblePixels: applyTumble, onPanPixels: applyPan, pixelWheelLooks: !onZoom })

  useImperativeHandle(ref, () => ({
    reset,
  }), [reset])

  useEffect(() => {
    if (preserveCameraOnMount) preserveCamera()
    else reset()
  }, [preserveCamera, preserveCameraOnMount, reset])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.type === 'keyup') { keys.current.delete(e.code); return }
      const uiTarget = e.target instanceof Element && e.target.closest('button, a, [role="tab"]')
      if (isEditableTarget(e.target) || (uiTarget && document.pointerLockElement !== gl.domElement)) {
        keys.current.delete(e.code)
        return
      }
      if (e.code === 'Space') e.preventDefault()
      if (e.type === 'keydown') keys.current.add(e.code)
      else keys.current.delete(e.code)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    const clearKeys = () => keys.current.clear()
    window.addEventListener('blur', clearKeys)
    document.addEventListener('pointerlockchange', clearKeys)
    const onMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement === gl.domElement) applyTumble(event.movementX, event.movementY)
    }
    window.addEventListener('mousemove', onMouseMove)
    const focusCanvas = () => {
      gl.domElement.tabIndex = 0
      gl.domElement.focus({ preventScroll: true })
    }
    gl.domElement.addEventListener('pointerdown', focusCanvas)

    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      window.removeEventListener('blur', clearKeys)
      document.removeEventListener('pointerlockchange', clearKeys)
      window.removeEventListener('mousemove', onMouseMove)
      gl.domElement.removeEventListener('pointerdown', focusCanvas)
      clearKeys()
    }
  }, [gl.domElement, applyTumble])

  useFrame((_state, delta) => {
    if (gl.xr.isPresenting) return
    // Camera focus: lerp rawYaw/rawPitch toward clicked object (only when pointer is not locked)
    const focusTarget = cameraFocusTarget.current
    if (focusTarget && document.pointerLockElement !== gl.domElement) {
      const dir = new THREE.Vector3().subVectors(focusTarget, camera.position).normalize()
      const targetPitch = Math.asin(Math.max(-1, Math.min(1, dir.y)))
      const targetYaw = Math.atan2(-dir.x, -dir.z)
      const t = 1 - Math.pow(0.04, delta)  // ~smooth decay
      // wrap yaw diff to [-π, π] to avoid spinning the long way
      const yawDiff = ((targetYaw - rawYaw.current + Math.PI * 3) % (Math.PI * 2)) - Math.PI
      rawYaw.current += yawDiff * t
      rawPitch.current += (targetPitch - rawPitch.current) * t
      rawPitch.current = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, rawPitch.current))
      if (Math.abs(yawDiff * t) < 0.0005 && Math.abs((targetPitch - rawPitch.current) * t) < 0.0005) {
        cameraFocusTarget.current = null
      }
    }

    const smoothing = 1 - Math.pow(1 - SMOOTH, Math.min(delta, 0.1) * 60)
    smoothYaw.current += (rawYaw.current - smoothYaw.current) * smoothing
    smoothPitch.current += (rawPitch.current - smoothPitch.current) * smoothing
    _euler.set(smoothPitch.current, smoothYaw.current, 0)
    camera.quaternion.setFromEuler(_euler)

    let fwd = 0, strafe = 0, vert = 0
    const k = keys.current
    if (k.has('KeyW') || k.has('ArrowUp')) fwd += 1
    if (k.has('KeyS') || k.has('ArrowDown')) fwd -= 1
    if (k.has('KeyA') || k.has('ArrowLeft')) strafe -= 1
    if (k.has('KeyD') || k.has('ArrowRight')) strafe += 1
    if (k.has('KeyE') || k.has('Space')) vert += 1
    if (k.has('KeyQ') || k.has('ShiftLeft') || k.has('ShiftRight')) vert -= 1

    _forward.set(0, 0, -1).applyQuaternion(camera.quaternion).setY(0).normalize()
    _right.set(1, 0, 0).applyQuaternion(camera.quaternion).setY(0).normalize()
    _move.set(0, 0, 0)
      .addScaledVector(_forward, fwd)
      .addScaledVector(_right, strafe)
      .addScaledVector(_up, vert)
    if (_move.lengthSq() > 1) _move.normalize()

    const speed = SPEED * (k.has('KeyF') ? FAST_MULT : 1)
    camera.position.addScaledVector(_move, speed * Math.min(delta, 0.1))
  })

  return null
})
