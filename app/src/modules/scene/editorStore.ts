import { create } from 'zustand'
import { useMotionStore } from '../motion/store'

export type EditorSelection = { kind: 'actor'; actor: number } | { kind: 'object'; instanceId: string } | null

interface SceneEditorState {
  selection: EditorSelection
  settingsOpen: boolean
  actorMode: 'translate' | 'rotate'
  hoveredActor: number | null
}

export const useSceneEditorStore = create<SceneEditorState>(() => ({
  selection: { kind: 'actor', actor: 0 },
  settingsOpen: false,
  actorMode: 'translate',
  hoveredActor: null,
}))

export function selectActor(actor: number) {
  const motion = useMotionStore.getState()
  const track = motion.timeline?.actors.find(item => item.actor === actor)
  const selectedClipId = track?.clips.some(clip => clip.id === motion.selectedClipId)
    ? motion.selectedClipId : track?.clips[0]?.id ?? ''
  useMotionStore.setState({ selectedClipId, pathPick: null, playing: false })
  useSceneEditorStore.setState({ selection: { kind: 'actor', actor }, settingsOpen: false })
}

export function selectObject(instanceId: string) {
  useMotionStore.setState({ pathPick: null, playing: false })
  useSceneEditorStore.setState({ selection: { kind: 'object', instanceId }, settingsOpen: false })
}
