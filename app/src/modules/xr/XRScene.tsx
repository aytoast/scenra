import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { Euler, Group } from 'three'
import { useXRStore } from './store'
import { requestVRSession, type VRMode } from './session'

// Capture physical runtime before optional simulator overrides navigator.xr.
const headsetRuntime = navigator.xr

/** Shared origin keeps headset tracking and controller rays in world coordinates. */
export function XRScene({ enabled }: { enabled: boolean }) {
  const { camera, gl, scene } = useThree()
  const rig = useMemo(() => new Group(), [])
  useEffect(() => {
    let disposed = false
    let session: XRSession | null = null
    let cameraInRig = false
    let supportCheck = 0
    let releaseSimulator: (() => void) | undefined
    const originalPosition = camera.position.clone()
    const originalQuaternion = camera.quaternion.clone()
    let originalParent = camera.parent
    rig.name = 'VR player origin'
    scene.add(rig)
    const controllers = [gl.xr.getController(0), gl.xr.getController(1)]
    const checkHeadset = () => {
      if (disposed || session || useXRStore.getState().pending) return
      const check = ++supportCheck
      if (!enabled || !window.isSecureContext || !headsetRuntime) {
        useXRStore.setState({ supported: false, checking: false })
        return
      }
      useXRStore.setState({ checking: true })
      void headsetRuntime.isSessionSupported('immersive-vr').then(supported => {
        if (!disposed && check === supportCheck) useXRStore.setState({ supported, checking: false })
      }).catch(() => {
        if (!disposed && check === supportCheck) useXRStore.setState({ supported: false, checking: false })
      })
    }
    const restoreCamera = () => {
      if (!cameraInRig) return
      cameraInRig = false
      originalParent?.add(camera)
      if (!originalParent) camera.removeFromParent()
      camera.position.copy(originalPosition)
      camera.quaternion.copy(originalQuaternion)
      controllers.forEach(controller => controller.removeFromParent())
    }
    const started = () => {
      if (disposed) return
      session = gl.xr.getSession()
      originalParent = camera.parent
      originalPosition.copy(camera.position)
      originalQuaternion.copy(camera.quaternion)
      rig.position.set(camera.position.x, 0, camera.position.z)
      rig.rotation.set(0, new Euler().setFromQuaternion(originalQuaternion, 'YXZ').y, 0)
      rig.add(camera, ...controllers)
      cameraInRig = true
      camera.position.set(0, 0, 0)
      camera.quaternion.identity()
      useXRStore.setState({ active: true, pending: false, message: '' })
    }
    const ended = () => {
      restoreCamera()
      session = null
      if (!disposed) useXRStore.setState({ active: false, pending: false, mode: null, message: '' })
      // Runtime globals must outlive Three's session-end listeners.
      queueMicrotask(() => { releaseSimulator?.(); if (!disposed) checkHeadset() })
    }
    const enter = async (mode: VRMode) => {
      if (disposed || !enabled || session || gl.xr.getSession() || useXRStore.getState().pending || (mode === 'headset' && useXRStore.getState().checking)) return
      useXRStore.setState({ pending: true, mode, message: '' })
      try {
        if (document.pointerLockElement) document.exitPointerLock()
        if (mode === 'headset' && !window.isSecureContext) {
          throw new Error('Open HTTPS scene link in PICO Browser, then choose Connect PICO.')
        }
        session = await requestVRSession({
          mode,
          headset: headsetRuntime,
          headsetSupported: useXRStore.getState().supported,
          isCurrent: () => !disposed,
          onMode: mode => useXRStore.setState({ mode }),
          loadSimulator: async () => {
            const simulator = await import('./simulator')
            if (disposed) return null
            releaseSimulator = simulator.uninstallSimulator
            return simulator.installSimulator()
          },
        })
        if (!session) {
          releaseSimulator?.()
          if (!disposed) useXRStore.setState({ pending: false, mode: null })
          return
        }
        if (disposed) { await session.end(); releaseSimulator?.(); return }
        gl.xr.setReferenceSpaceType('local-floor')
        gl.xr.setFramebufferScaleFactor(0.75)
        await gl.xr.setSession(session)
        if (disposed) { await session.end(); releaseSimulator?.(); return }
        gl.xr.setFoveation(1)
      } catch (error) {
        await session?.end().catch(() => {})
        session = null
        restoreCamera()
        releaseSimulator?.()
        if (!disposed) useXRStore.setState({ pending: false, active: false, mode: null, message: error instanceof Error ? error.message : 'VR session could not start.' })
      }
    }
    gl.xr.addEventListener('sessionstart', started)
    gl.xr.addEventListener('sessionend', ended)
    headsetRuntime?.addEventListener('devicechange', checkHeadset)
    useXRStore.setState({ mode: null, message: '', enter: enabled ? enter : null, exit: async () => { await session?.end(); releaseSimulator?.() } })
    checkHeadset()
    return () => {
      disposed = true
      const closingSession = session
      if (closingSession) void closingSession.end().catch(() => {}).finally(() => releaseSimulator?.())
      else releaseSimulator?.()
      restoreCamera()
      gl.xr.removeEventListener('sessionstart', started)
      gl.xr.removeEventListener('sessionend', ended)
      headsetRuntime?.removeEventListener('devicechange', checkHeadset)
      rig.removeFromParent()
      useXRStore.setState({ active: false, pending: false, checking: false, mode: null, enter: null, exit: null })
    }
  }, [camera, enabled, gl, rig, scene])

  return null
}
