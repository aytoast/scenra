export type VRMode = 'headset' | 'simulator'
type SessionRuntime = Pick<XRSystem, 'requestSession'>

export interface VRSessionRequest {
  mode: VRMode
  headset: SessionRuntime | undefined
  headsetSupported: boolean
  loadSimulator: () => Promise<SessionRuntime | null>
  onMode: (mode: VRMode) => void
  isCurrent: () => boolean
}

/** Preserve headset click activation and enter only requested runtime. */
export async function requestVRSession({ mode, headset, headsetSupported, loadSimulator, onMode, isCurrent }: VRSessionRequest): Promise<XRSession | null> {
  if (!isCurrent()) return null
  const accept = async (session: XRSession) => {
    if (isCurrent()) return session
    await session.end()
    return null
  }
  const options: XRSessionInit = { requiredFeatures: ['local-floor'] }
  onMode(mode)
  if (mode === 'headset') {
    if (!headsetSupported || !headset) {
      throw new DOMException('Open this scene in PICO Browser, then choose Connect PICO.', 'NotSupportedError')
    }
    try {
      return await accept(await headset.requestSession('immersive-vr', options))
    } catch (error) {
      if (!isCurrent()) return null
      throw error
    }
  }
  if (!isCurrent()) return null
  const simulator = await loadSimulator()
  if (!simulator || !isCurrent()) return null
  return accept(await simulator.requestSession('immersive-vr', options))
}
