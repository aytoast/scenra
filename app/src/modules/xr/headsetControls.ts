import type { XRDevice } from 'iwer'
import { Euler, Quaternion, Vector3 } from 'three'

const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyQ', 'Space', 'ShiftLeft', 'ShiftRight'])

/** Simulator-only controls; native headset tracking remains unchanged. */
export function installHeadsetControls(device: XRDevice) {
  const devui = device.devui
  if (!devui) return () => {}
  const canvas = devui.devUICanvas
  canvas.tabIndex = 0
  canvas.setAttribute('aria-label', 'Simulator headset viewport')
  const panel = document.createElement('section')
  panel.hidden = true
  panel.className = 'chrome-glass'
  panel.setAttribute('aria-label', 'Simulator headset controls')
  panel.style.cssText = 'position:fixed;top:64px;right:16px;z-index:2147483647;width:276px;padding:12px;color:white;border:1px solid #ffffff30;border-radius:5px;font:12px system-ui;pointer-events:auto;box-sizing:border-box'
  panel.innerHTML = '<strong style="font-size:13px">VR simulator</strong><div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0"><button type="button">Mouse look</button><button type="button">Reset view</button><button type="button">Exit simulator</button></div><p style="margin:6px 0;line-height:1.6">Right-drag to look · WASD move<br>E / Space up · Q / Shift down</p><p role="status" style="margin:6px 0 0;color:#ddd">Click scene to use movement keys.</p>'
  const [lookButton, resetButton, exitButton] = Array.from(panel.querySelectorAll('button'))
  for (const button of [lookButton, resetButton, exitButton]) button.style.cssText = 'border:1px solid #ffffff40;border-radius:3px;background:#ffffff10;color:white;padding:6px 10px;font:inherit;cursor:pointer'
  document.body.append(panel)
  const status = panel.querySelector('[role="status"]')!
  const keys = new Set<string>()
  const rotation = new Quaternion()
  const euler = new Euler(0, 0, 0, 'YXZ')
  const delta = new Vector3()
  const initialPosition = [device.position.x, device.position.y, device.position.z]
  const initialRotation = [device.quaternion.x, device.quaternion.y, device.quaternion.z, device.quaternion.w]
  let dragging = false
  let lastX = 0, lastY = 0
  let previousTime = performance.now()
  let frame = 0

  const applyPose = (position: number[], quaternion: number[], carryHands: boolean) => {
    const shift = carryHands ? position.map((value, axis) => value - [device.position.x, device.position.y, device.position.z][axis]) : [0, 0, 0]
    for (const controller of Object.values(device.controllers)) {
      const p = [controller.position.x, controller.position.y, controller.position.z].map((value, axis) => value + shift[axis])
      controller.position.set(p[0], p[1], p[2])
    }
    device.position.set(position[0], position[1], position[2])
    device.quaternion.set(quaternion[0], quaternion[1], quaternion[2], quaternion[3])
    // Sync current pose through public control mode API. applyDefaultPose is for
    // saved defaults and doubles X/Z translation during its manual render loop.
    const mode = device.controlMode
    device.controlMode = 'programmatic'
    device.notifyStateChange()
    device.controlMode = mode
  }
  const rotate = (dx: number, dy: number) => {
    rotation.set(device.quaternion.x, device.quaternion.y, device.quaternion.z, device.quaternion.w)
    euler.setFromQuaternion(rotation, 'YXZ')
    euler.y -= dx * 0.002
    euler.x = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, euler.x - dy * 0.002))
    rotation.setFromEuler(euler)
    applyPose([device.position.x, device.position.y, device.position.z], rotation.toArray(), false)
  }
  const focus = () => canvas.focus({ preventScroll: true })
  const pointerDown = (event: PointerEvent) => {
    focus()
    if (event.button !== 2 || !device.activeSession) return
    event.preventDefault(); event.stopImmediatePropagation()
    dragging = true; lastX = event.clientX; lastY = event.clientY
  }
  const pointerMove = (event: PointerEvent) => {
    if (!dragging || document.pointerLockElement === canvas) return
    event.preventDefault(); event.stopImmediatePropagation()
    rotate(event.clientX - lastX, event.clientY - lastY)
    lastX = event.clientX; lastY = event.clientY
  }
  const pointerUp = () => { dragging = false }
  const contextMenu = (event: MouseEvent) => { if (device.activeSession) event.preventDefault() }
  const mouseMove = (event: MouseEvent) => {
    if (document.pointerLockElement !== canvas || !device.activeSession) return
    event.stopImmediatePropagation()
    rotate(event.movementX, event.movementY)
  }
  const keyDown = (event: KeyboardEvent) => {
    if (!device.activeSession || !movementKeys.has(event.code) || event.altKey || event.ctrlKey || event.metaKey) return
    const editing = event.composedPath().some(target => target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)))
    if (editing || (document.activeElement !== canvas && document.pointerLockElement !== canvas)) return
    event.preventDefault(); event.stopImmediatePropagation()
    keys.add(event.code)
  }
  const keyUp = (event: KeyboardEvent) => { if (keys.delete(event.code)) { event.preventDefault(); event.stopImmediatePropagation() } }
  const clear = () => { keys.clear(); dragging = false }
  const lockChanged = () => {
    clear()
    status.textContent = document.pointerLockElement === canvas ? 'Mouse turns head. ESC returns to controller controls.' : 'Right-drag to look. Click scene to use movement keys.'
  }
  lookButton.onclick = () => {
    focus()
    try { canvas.requestPointerLock()?.catch(() => { status.textContent = 'Right-drag scene to turn head.' }) }
    catch { status.textContent = 'Right-drag scene to turn head.' }
  }
  resetButton.onclick = () => { clear(); applyPose(initialPosition, initialRotation, false) }
  exitButton.onclick = () => { clear(); void device.activeSession?.end() }
  const tick = () => {
    // Emulated XR may use another timestamp origin; use one local clock.
    const time = performance.now()
    const dt = Math.max(0, Math.min((time - previousTime) / 1000, 0.05))
    previousTime = time
    panel.hidden = !device.activeSession
    if (!device.activeSession || document.hidden) clear()
    if (keys.size) {
      rotation.set(device.quaternion.x, device.quaternion.y, device.quaternion.z, device.quaternion.w)
      euler.setFromQuaternion(rotation, 'YXZ')
      delta.set(Number(keys.has('KeyD')) - Number(keys.has('KeyA')), 0, Number(keys.has('KeyS')) - Number(keys.has('KeyW')))
      if (delta.lengthSq()) delta.normalize().applyAxisAngle(new Vector3(0, 1, 0), euler.y)
      delta.y = Number(keys.has('KeyE') || keys.has('Space')) - Number(keys.has('KeyQ') || keys.has('ShiftLeft') || keys.has('ShiftRight'))
      delta.multiplyScalar(3 * dt)
      applyPose([device.position.x + delta.x, device.position.y + delta.y, device.position.z + delta.z], rotation.toArray(), true)
    }
    frame = requestAnimationFrame(tick)
  }
  canvas.addEventListener('pointerdown', pointerDown, true)
  canvas.addEventListener('contextmenu', contextMenu)
  document.addEventListener('pointermove', pointerMove, true)
  document.addEventListener('pointerup', pointerUp, true)
  document.addEventListener('mousemove', mouseMove, true)
  document.addEventListener('keydown', keyDown, true)
  document.addEventListener('keyup', keyUp, true)
  document.addEventListener('pointerlockchange', lockChanged)
  window.addEventListener('blur', clear)
  frame = requestAnimationFrame(tick)
  return () => {
    cancelAnimationFrame(frame); clear(); panel.remove()
    canvas.removeEventListener('pointerdown', pointerDown, true)
    canvas.removeEventListener('contextmenu', contextMenu)
    document.removeEventListener('pointermove', pointerMove, true)
    document.removeEventListener('pointerup', pointerUp, true)
    document.removeEventListener('mousemove', mouseMove, true)
    document.removeEventListener('keydown', keyDown, true)
    document.removeEventListener('keyup', keyUp, true)
    document.removeEventListener('pointerlockchange', lockChanged)
    window.removeEventListener('blur', clear)
  }
}
