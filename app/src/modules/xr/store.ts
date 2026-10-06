import { create } from 'zustand'
import type { VRMode } from './session'

export const useXRStore = create<{
  supported: boolean
  checking: boolean
  mode: VRMode | null
  active: boolean
  pending: boolean
  message: string
  enter: ((mode: VRMode) => Promise<void>) | null
  exit: (() => Promise<void>) | null
}>(() => ({ supported: false, checking: true, mode: null, active: false, pending: false, message: '', enter: null, exit: null }))
