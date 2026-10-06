import { create } from 'zustand'
import { removeDemoIntro, validateTimeline, type DirectorTimeline } from './directorTimeline'
import type { SavedMotion } from './stageonData'

interface MotionState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string
  playing: boolean
  visible: boolean
  collisions: boolean
  loop: boolean
  frame: number
  seekToken: number
  sceneResetToken: number
  frameCount: number
  fps: number
  actorCount: number
  timeline: DirectorTimeline | null
  original: DirectorTimeline | null
  timelineRevision: number
  slug: string
  sourceFrameCount: number
  sourceMotion: SavedMotion | null
  selectedClipId: string
  pathPick: { clipId: string; edge: 'from' | 'to' } | null
}
export const useMotionStore = create<MotionState>(() => ({ status: 'idle', error: '', playing: true, visible: true, collisions: true, loop: true, frame: 0, seekToken: 0, sceneResetToken: 0, frameCount: 0, fps: 20, actorCount: 0, timeline: null, original: null, timelineRevision: 0, slug: '', sourceFrameCount: 0, sourceMotion: null, selectedClipId: '', pathPick: null }))

export function updateTimeline(value: unknown) {
  const state = useMotionStore.getState()
  const timeline = removeDemoIntro(validateTimeline(value, state.actorCount, state.sourceFrameCount, state.fps))
  useMotionStore.setState({ timeline, frameCount: timeline.frameCount, frame: Math.min(state.frame, timeline.frameCount - 1), playing: false, timelineRevision: state.timelineRevision + 1, seekToken: state.seekToken + 1 })
  try { localStorage.setItem(`scenra-timeline-v1:${state.slug}`, JSON.stringify(timeline)) } catch { /* Editing and JSON export remain available if browser storage is full. */ }
}

export function seekMotion(frame: number) {
  useMotionStore.setState((state) => {
    const target = Number.isFinite(frame) ? Math.max(0, Math.min(Math.max(0, state.frameCount - 1), Math.round(frame))) : 0
    return { frame: target, seekToken: state.seekToken + 1, sceneResetToken: state.sceneResetToken + (target === 0 ? 1 : 0) }
  })
}

export function finishMotionLoop() {
  useMotionStore.setState((state) => ({ sceneResetToken: state.sceneResetToken + 1 }))
}
