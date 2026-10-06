import { Line } from '@react-three/drei'
import { updateTimeline, useMotionStore } from './store'
import type { Vec3Tuple } from '../../types/world'
import { selectActor } from '../scene/editorStore'

export function ActorPaths({ position }: { position: Vec3Tuple }) {
  const timeline = useMotionStore(state => state.timeline)
  const selected = useMotionStore(state => state.selectedClipId)
  const pick = useMotionStore(state => state.pathPick)
  if (!timeline) return null
  return <group position={position}>
    {timeline.actors.flatMap(track => track.clips.filter(clip => !clip.native).map(clip => {
      const from: Vec3Tuple = [clip.from[0], 0.045, clip.from[1]], to: Vec3Tuple = [clip.to[0], 0.045, clip.to[1]]
      const color = track.actor === 0 ? '#d0ab69' : '#80bbb2'
      return <group key={clip.id}><Line points={[from, to]} color={color} opacity={clip.id === selected ? 1 : .4} transparent lineWidth={2} />
        {[from, to].map((point, index) => <mesh key={index} position={point} onClick={event => { event.stopPropagation(); useMotionStore.setState({ selectedClipId: clip.id }); selectActor(track.actor) }}><sphereGeometry args={[clip.id === selected ? .065 : .04, 10, 6]} /><meshBasicMaterial color={color} /></mesh>)}</group>
    }))}
    {pick && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .02, 0]} onClick={event => {
      event.stopPropagation()
      const next = structuredClone(timeline), clip = next.actors.flatMap(track => track.clips).find(item => item.id === pick.clipId)
      if (!clip) return
      clip[pick.edge] = [event.point.x - position[0], event.point.z - position[2]]; clip.native = false
      updateTimeline(next); useMotionStore.setState({ pathPick: null })
    }}><planeGeometry args={[100, 100]} /><meshBasicMaterial color="#d0ab69" transparent opacity={.04} depthWrite={false} /></mesh>}
  </group>
}
