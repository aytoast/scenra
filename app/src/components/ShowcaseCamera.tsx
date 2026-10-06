import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { PerspectiveCamera } from 'three'

/** Website preview uses same scene renderer and saved motion as full workspace. */
export function ShowcaseCamera({ mode }: { mode: string }) {
  const camera = useThree(state => state.camera)
  const time = useRef(0)
  useEffect(() => {
    if (camera instanceof PerspectiveCamera) { camera.fov = mode === 'props' ? 48 : 58; camera.updateProjectionMatrix() }
  }, [camera, mode])
  useFrame((_, delta) => {
    if (document.hidden) return
    time.current += Math.min(delta, 0.1)
    const phase = Math.sin(time.current * 0.09)
    if (mode === 'props') { camera.position.set(2.5 + phase * 1.8, 2.1, 1.9); camera.lookAt(0.35, 0.6, -3.6) }
    else if (mode === 'motion') { camera.position.set(0.7 + phase * 1.3, 1.7, 2.3); camera.lookAt(-0.2, 0.9, -3) }
    else { camera.position.set(-2.7 + phase * 2.1, 2.5, 4.3); camera.lookAt(0, 1, -3.3) }
  })
  return null
}
