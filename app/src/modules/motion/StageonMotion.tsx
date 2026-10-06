import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Matrix4, type Mesh } from 'three'
import { decodeCoreSkin, decodeSavedMotion, poseSkin, type CoreSkin, type SavedMotion, type SavedMotionManifest } from './stageonData'
import { finishMotionLoop, useMotionStore } from './store'
import type { WorldMotion } from '../../types/world'
import { MotionColliders } from './StageonBodies'
import { blockingMotion } from './blockingMotion'
import { originalTimeline, removeDemoIntro, sampleActor, validateTimeline, type MotionLibrary } from './directorTimeline'
import { ActorEditorControls } from './ActorEditorControls'
import { selectActor } from '../scene/editorStore'
import { markObjectInteraction } from '../interaction/pointerGuards'

async function asset(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error('Saved Stageon asset could not load.')
  return response
}

export function StageonMotion({ config, slug, physics = true, autoPlay = true, editable = false }: { config: WorldMotion; slug: string; physics?: boolean; autoPlay?: boolean; editable?: boolean }) {
  const autoPlayRef = useRef(autoPlay)
  autoPlayRef.current = autoPlay
  const [data, setData] = useState<{ skin: CoreSkin; library: MotionLibrary } | null>(null)
  const clock = useRef(0)
  const lastFrame = useRef(-1)
  const lastSeek = useRef(-1)
  const skipDelta = useRef(true)
  const visible = useMotionStore((state) => state.visible)
  useEffect(() => {
    const controller = new AbortController()
    setData(null)
    useMotionStore.setState({ status: 'loading', error: '', frame: 0, playing: autoPlayRef.current, timeline: null, slug, pathPick: null, selectedClipId: '' })
    const load = async () => {
      const [manifestResponse, skinResponse] = await Promise.all([asset(config.manifest_url, controller.signal), asset(config.skin_url, controller.signal)])
      const manifest = await manifestResponse.json() as SavedMotionManifest
      const url = new URL(manifest.data, new URL(config.manifest_url, location.href))
      if (url.origin !== location.origin) throw new Error('Saved motion must use same origin.')
      const binary = await asset(url.href, controller.signal)
      const motion = decodeSavedMotion(manifest, await binary.arrayBuffer())
      const skin = decodeCoreSkin(await skinResponse.arrayBuffer())
      if (controller.signal.aborted) return
      clock.current = 0
      lastFrame.current = -1
      lastSeek.current = useMotionStore.getState().seekToken
      skipDelta.current = true
      let timeline = originalTimeline(motion)
      const showcase = new URLSearchParams(location.search).has('showcase')
      if (!showcase) try {
        const saved = localStorage.getItem(`scenra-timeline-v1:${slug}`)
        if (saved) {
          timeline = removeDemoIntro(validateTimeline(JSON.parse(saved), manifest.actorCount, manifest.frameCount, manifest.fps))
          localStorage.setItem(`scenra-timeline-v1:${slug}`, JSON.stringify(timeline))
        }
      } catch { /* Invalid stored edits fall back to original take. */ }
      setData({ skin, library: { saved: motion, walk: blockingMotion(skin, true), idle: blockingMotion(skin, false) } })
      useMotionStore.setState({ status: 'ready', playing: autoPlayRef.current, frameCount: timeline.frameCount, fps: manifest.fps, actorCount: manifest.actorCount, sourceFrameCount: manifest.frameCount, sourceMotion: motion, timeline, original: originalTimeline(motion), timelineRevision: 0 })
    }
    void load().catch((error: unknown) => {
      if (!controller.signal.aborted) useMotionStore.setState({ status: 'error', error: error instanceof Error ? error.message : 'Saved motion could not load.' })
    })
    return () => { controller.abort(); useMotionStore.setState({ status: 'idle', frameCount: 0, actorCount: 0, timeline: null }) }
  }, [config.manifest_url, config.skin_url, slug])
  useEffect(() => {
    const changed = () => { skipDelta.current = true }
    document.addEventListener('visibilitychange', changed)
    return () => document.removeEventListener('visibilitychange', changed)
  }, [])

  useFrame((_, delta) => {
    if (!data || document.hidden) return
    const state = useMotionStore.getState()
    if (state.status !== 'ready' || state.frameCount < 1 || state.fps <= 0) return
    if (!Number.isFinite(clock.current)) clock.current = 0
    if (state.seekToken !== lastSeek.current || state.frame !== lastFrame.current) {
      clock.current = state.frame / state.fps
      skipDelta.current = true
      lastSeek.current = state.seekToken
    }
    if (state.playing && !skipDelta.current) clock.current += delta
    skipDelta.current = false
    const duration = state.frameCount / state.fps
    if (clock.current >= duration) {
      if (state.loop) { clock.current %= duration; finishMotionLoop() }
      else { clock.current = (state.frameCount - 1) / state.fps; useMotionStore.setState({ playing: false }) }
    }
    const frame = Math.max(0, Math.min(state.frameCount - 1, Math.floor(clock.current * state.fps)))
    lastFrame.current = frame
    if (frame !== state.frame) useMotionStore.setState({ frame })
  }, -1)

  if (!data) return null
  return <><group position={config.position} visible={visible} userData={{ stageonMotion: true }}>
    {Array.from({ length: data.library.saved.manifest.actorCount }, (_, actor) => <MotionActor key={actor} actor={actor} skin={data.skin} library={data.library} editable={editable} />)}
  </group>{physics && <MotionColliders library={data.library} position={config.position} clock={clock} />}</>
}

function MotionActor({ actor, skin, library, editable }: { actor: number; skin: CoreSkin; library: MotionLibrary; editable: boolean }) {
  const lastSample = useRef<{ motion?: SavedMotion; frame: number }>({ frame: -1 })
  const [hovered, setHovered] = useState(false)
  const suppressSelectionUntil = useRef(0)
  const mesh = useRef<Mesh>(null)
  const geometry = useMemo(() => {
    const value = new BufferGeometry()
    value.setAttribute('position', new BufferAttribute(new Float32Array(skin.vertexCount * 3), 3).setUsage(DynamicDrawUsage))
    value.setAttribute('normal', new BufferAttribute(new Float32Array(skin.vertexCount * 3), 3).setUsage(DynamicDrawUsage))
    value.setIndex(new BufferAttribute(skin.faces, 1))
    return value
  }, [skin])
  const matrices = useMemo(() => Array.from({ length: skin.jointCount }, () => new Matrix4()), [skin])
  useEffect(() => () => geometry.dispose(), [geometry])
  useFrame(() => {
    const state = useMotionStore.getState()
    const track = state.timeline?.actors.find(item => item.actor === actor)
    if (!track || !mesh.current) return
    const sample = sampleActor(library, track, state.frame)
    mesh.current.position.set(...sample.translation)
    mesh.current.rotation.y = sample.yaw
    if (lastSample.current.frame === sample.sourceFrame && lastSample.current.motion === sample.motion) return
    lastSample.current = { motion: sample.motion, frame: sample.sourceFrame }
    const positions = geometry.getAttribute('position') as BufferAttribute
    const normals = geometry.getAttribute('normal') as BufferAttribute
    poseSkin(skin, sample.motion, sample.actor, sample.sourceFrame, matrices, positions.array as Float32Array, normals.array as Float32Array)
    positions.needsUpdate = true
    normals.needsUpdate = true
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
  }, -.5)
  return <><mesh ref={mesh} geometry={geometry} castShadow receiveShadow frustumCulled={false} userData={{ stageonActor: actor }}
    onPointerOver={event => { if (!editable || useMotionStore.getState().pathPick) return; event.stopPropagation(); markObjectInteraction(); setHovered(true) }}
    onPointerOut={event => { if (editable) event.stopPropagation(); setHovered(false) }}
    onPointerDown={event => { if (!editable || useMotionStore.getState().pathPick || event.button !== 0) return; event.stopPropagation(); markObjectInteraction() }}
    onClick={event => { if (!editable || useMotionStore.getState().pathPick || event.button !== 0 || performance.now() < suppressSelectionUntil.current) return; event.stopPropagation(); markObjectInteraction(); selectActor(actor) }}>
    <meshStandardMaterial color={actor === 0 ? '#cbbca6' : '#8baaa8'} roughness={0.8} metalness={0.02} />
  </mesh><ActorEditorControls actor={actor} library={library} mesh={mesh} editable={editable} hovered={hovered} onDragging={dragging => { suppressSelectionUntil.current = dragging ? Infinity : performance.now() + 150 }} /></>
}

