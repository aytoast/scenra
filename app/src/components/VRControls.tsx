import { useXRStore } from '../modules/xr/store'
import { chrome } from './AppChrome'

export function VRControls({ visible }: { visible: boolean }) {
  const { supported, checking, mode, active, pending, message, enter, exit } = useXRStore()
  const simulated = mode === 'simulator'
  const exitLabel = simulated ? 'Exit VR simulator' : 'Exit VR'
  const pendingLabel = simulated ? 'Starting simulator…' : 'Connecting…'
  const status = active
    ? simulated ? 'Simulated headset · WASD move · Right-drag look' : 'Head tracking · Sticks select props · Hold stick click to grab'
    : checking ? 'Checking headset availability…' : supported ? 'Headset ready' : 'Connect from PICO Browser'
  return <div className={`scene-vr ${chrome.panel}`} hidden={!visible || (active && simulated)}>
    {active
      ? <button disabled={pending || !exit} onClick={() => void exit?.()}>{exitLabel}</button>
      : <>
        <button className="scene-vr-connect" disabled={pending || checking || !enter} onClick={() => void enter?.('headset')}>{pending && !simulated ? pendingLabel : 'Connect PICO'}</button>
        <button disabled={pending || !enter} onClick={() => void enter?.('simulator')}>{pending && simulated ? pendingLabel : 'Use simulator'}</button>
      </>}
    <span role="status">{message || status}</span>
  </div>
}
