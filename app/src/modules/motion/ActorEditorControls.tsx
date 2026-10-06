import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { TransformControls } from '@react-three/drei'
import { createPortal, useFrame, useThree } from '@react-three/fiber'
import { AxesHelper, Box3, Box3Helper, Group, type Mesh } from 'three'
import type { TransformControls as TransformControlsImpl } from 'three-stdlib'
import { activeClip, clipRoot, sampleActor, type ActorClip, type MotionLibrary } from './directorTimeline'
import { transformActorClip } from './actorTransform'
import { updateTimeline, useMotionStore } from './store'
import { useSceneEditorStore } from '../scene/editorStore'
import { markObjectInteraction } from '../interaction/pointerGuards'
import { isEditableTarget } from '../../utils/dom'

interface Props {
  actor: number
  library: MotionLibrary
  mesh: RefObject<Mesh | null>
  editable: boolean
  hovered: boolean
  onDragging: (dragging: boolean) => void
}

interface DragSnapshot {
  clip: ActorClip
  frame: number
  x: number
  z: number
  yaw: number
  cancelled: boolean
}

function endGesture(target: TransformControlsImpl | null) {
  if (!target) return
  // three-stdlib exposes these mutable properties through event-dispatching setters.
  const gesture = target as unknown as { dragging: boolean; axis: string | null }
  gesture.dragging = false
  gesture.axis = null
}

export function ActorEditorControls({ actor, library, mesh, editable, hovered, onDragging }: Props) {
  const scene = useThree(state => state.scene)
  const selection = useSceneEditorStore(state => state.selection)
  const mode = useSceneEditorStore(state => state.actorMode)
  const hoveredActor = useSceneEditorStore(state => state.hoveredActor)
  const playing = useMotionStore(state => state.playing)
  const pathPick = useMotionStore(state => state.pathPick)
  const selected = selection?.kind === 'actor' && selection.actor === actor
  const interactive = editable && selected && !playing && !pathPick
  const guidesVisible = editable && !pathPick && (selected || hovered || hoveredActor === actor)
  const pivot = useMemo(() => new Group(), [])
  const controls = useRef<TransformControlsImpl>(null)
  const drag = useRef<DragSnapshot | null>(null)
  const onDraggingRef = useRef(onDragging)
  onDraggingRef.current = onDragging
  const bounds = useMemo(() => new Box3(), [])
  const box = useMemo(() => {
    const helper = new Box3Helper(bounds, 0xffffff)
    helper.raycast = () => {}
    helper.userData.stageonActorBounds = actor
    return helper
  }, [actor, bounds])
  const axes = useMemo(() => {
    const helper = new AxesHelper(.2)
    helper.raycast = () => {}
    helper.userData.stageonActorAxes = actor
    return helper
  }, [actor])
  useEffect(() => () => { box.dispose(); axes.dispose() }, [axes, box])

  function draftClip(snapshot: DragSnapshot) {
    const object = pivot
    const yawDelta = Math.atan2(Math.sin(object.rotation.y - snapshot.yaw), Math.cos(object.rotation.y - snapshot.yaw))
    return transformActorClip(snapshot.clip, actor, snapshot.frame, library.saved, [object.position.x - snapshot.x, object.position.z - snapshot.z], yawDelta)
  }

  useEffect(() => {
    const target = controls.current
    if (!interactive || !target) return
    const events = target as unknown as {
      addEventListener: (type: 'mouseDown' | 'dragging-changed', listener: (event: { value?: boolean }) => void) => void
      removeEventListener: (type: 'mouseDown' | 'dragging-changed', listener: (event: { value?: boolean }) => void) => void
    }
    const begin = () => {
      const state = useMotionStore.getState()
      const track = state.timeline?.actors.find(item => item.actor === actor)
      const object = pivot
      if (!track || state.playing || state.pathPick) return
      const clip = activeClip(track, state.frame)
      drag.current = { clip: structuredClone(clip), frame: state.frame, x: object.position.x, z: object.position.z, yaw: object.rotation.y, cancelled: false }
      useMotionStore.setState({ selectedClipId: clip.id, playing: false })
      markObjectInteraction()
      onDraggingRef.current(true)
    }
    const finish = (event: { value?: boolean }) => {
      if (event.value !== false) return
      const snapshot = drag.current
      drag.current = null
      markObjectInteraction()
      onDraggingRef.current(false)
      if (!snapshot || snapshot.cancelled) return
      const current = useMotionStore.getState().timeline
      const track = current?.actors.find(item => item.actor === actor)
      const index = track?.clips.findIndex(item => item.id === snapshot.clip.id) ?? -1
      if (!current || !track || index < 0) return
      const transformed = draftClip(snapshot)
      if (JSON.stringify(transformed) === JSON.stringify(snapshot.clip)) return
      const next = structuredClone(current)
      next.actors.find(item => item.actor === actor)!.clips[index] = transformed
      try { updateTimeline(next) } catch { /* Invalid placement returns to last saved blocking. */ }
    }
    events.addEventListener('mouseDown', begin)
    events.addEventListener('dragging-changed', finish)
    return () => {
      events.removeEventListener('mouseDown', begin)
      events.removeEventListener('dragging-changed', finish)
      drag.current = null
      endGesture(target)
      onDraggingRef.current(false)
    }
  }, [actor, interactive, library, pivot])

  useEffect(() => {
    if (!editable || !selected) return
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isEditableTarget(event.target)) return
      event.preventDefault()
      const snapshot = drag.current
      if (snapshot) {
        snapshot.cancelled = true
        controls.current?.reset()
        endGesture(controls.current)
        drag.current = null
        onDraggingRef.current(false)
        markObjectInteraction()
        return
      }
      useMotionStore.setState({ pathPick: null })
      useSceneEditorStore.setState({ selection: null })
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [editable, selected])

  useFrame(() => {
    const state = useMotionStore.getState()
    const track = state.timeline?.actors.find(item => item.actor === actor)
    const object = pivot
    const body = mesh.current
    if (!track || !body) return
    const snapshot = drag.current
    if (snapshot && !snapshot.cancelled) {
      const previewTrack = { ...track, clips: track.clips.map(clip => clip.id === snapshot.clip.id ? draftClip(snapshot) : clip) }
      const sample = sampleActor(library, previewTrack, snapshot.frame)
      body.position.set(...sample.translation)
      body.rotation.y = sample.yaw
    } else {
      const clip = activeClip(track, state.frame)
      const point = clipRoot(clip, actor, state.frame, library.saved)
      object.position.set(point[0], 0, point[1])
      object.rotation.set(0, sampleActor(library, track, state.frame).yaw, 0)
    }
    if (guidesVisible && body.geometry.boundingBox) {
      body.updateMatrix()
      bounds.copy(body.geometry.boundingBox).applyMatrix4(body.matrix)
      box.updateMatrixWorld(true)
      axes.position.copy(object.position)
      axes.rotation.copy(object.rotation)
    }
  }, -.25)

  return <>
    <primitive object={pivot} userData={{ stageonActorTransform: actor }} />
    <primitive object={box} visible={guidesVisible} />
    <primitive object={axes} visible={guidesVisible} />
    {interactive && createPortal(<TransformControls ref={controls} object={pivot} mode={mode} space="world" showX={mode === 'translate'} showY={mode === 'rotate'} showZ={mode === 'translate'} />, scene)}
  </>
}
