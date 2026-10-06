import { XRDevice, metaQuest3 } from 'iwer'
import { DevUI } from '@iwer/devui/build/iwer-devui.module.js'
import { installHeadsetControls } from './headsetControls'

let device: XRDevice | null = null
let installed = false
let disposeControls: (() => void) | undefined
let originalUserAgent: PropertyDescriptor | undefined

export function installSimulator(): XRSystem {
  device ??= new XRDevice(metaQuest3)
  if (!installed) {
    originalUserAgent = Object.getOwnPropertyDescriptor(navigator, 'userAgent')
    device.installRuntime({ forceInstall: true })
    installed = true
  }
  if (!device.devui) {
    const existingHosts = new Set(document.body.children)
    device.installDevUI(DevUI)
    // App VR control owns entry; hide SDK's separate offered-session prompt.
    for (const host of Array.from(document.body.children)) {
      if (host instanceof HTMLElement && !existingHosts.has(host) && host.shadowRoot) {
        host.hidden = true
        host.style.display = 'none'
      }
    }
    disposeControls = installHeadsetControls(device)
    // Public runtime API supports repeatable headset/controller verification.
    Object.assign(window, { xrSimulator: device })
  }
  return navigator.xr!
}

export function uninstallSimulator() {
  if (!installed || device?.activeSession) return
  device?.uninstallRuntime()
  if (!originalUserAgent) Reflect.deleteProperty(navigator, 'userAgent')
  installed = false
}

import.meta.hot?.dispose(() => { disposeControls?.(); uninstallSimulator() })
