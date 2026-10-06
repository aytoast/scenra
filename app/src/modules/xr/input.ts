export function thumbstick(axes: readonly number[]) {
  // xr-standard exposes thumbsticks at 2/3; older profiles expose only 0/1.
  const offset = axes.length >= 4 ? 2 : 0
  const deadzone = (value: number) => Math.abs(value) < 0.18 ? 0 : value
  return { x: deadzone(axes[offset] ?? 0), y: deadzone(axes[offset + 1] ?? 0) }
}

export function selectionStep(value: number, armed: boolean) {
  if (Math.abs(value) < 0.25) return { step: 0, armed: true }
  if (armed && Math.abs(value) > 0.65) return { step: Math.sign(value), armed: false }
  return { step: 0, armed }
}
