import { expect, it, vi } from 'vitest'
import { requestVRSession, type VRMode } from './session'

function session() {
  return { end: vi.fn(async () => {}) } as unknown as XRSession
}

function harness() {
  const headsetSession = session()
  const simulatorSession = session()
  const headset = {
    requestSession: vi.fn((_mode: XRSessionMode, _options?: XRSessionInit) => Promise.resolve(headsetSession)),
  }
  const simulator = {
    requestSession: vi.fn((_mode: XRSessionMode, _options?: XRSessionInit) => Promise.resolve(simulatorSession)),
  }
  const options = {
    mode: 'headset' as VRMode,
    headset: headset as Pick<XRSystem, 'requestSession'> | undefined,
    headsetSupported: true,
    loadSimulator: vi.fn(async (): Promise<Pick<XRSystem, 'requestSession'> | null> => simulator),
    onMode: vi.fn((_mode: VRMode) => {}),
    isCurrent: vi.fn(() => true),
  }
  return { options, headset, simulator, headsetSession, simulatorSession }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(complete => { resolve = complete })
  return { promise, resolve }
}

it('requests supported headset synchronously so user activation reaches native WebXR', async () => {
  const fixture = harness()
  const pending = requestVRSession(fixture.options)

  expect(fixture.headset.requestSession).toHaveBeenCalledWith('immersive-vr', { requiredFeatures: ['local-floor'] })
  expect(fixture.options.loadSimulator).not.toHaveBeenCalled()
  expect(await pending).toBe(fixture.headsetSession)
  expect(fixture.options.onMode).toHaveBeenCalledWith('headset')
  expect(fixture.simulator.requestSession).not.toHaveBeenCalled()
})

it.each(['missing', 'unsupported'] as const)('keeps simulator closed when requested headset is %s', async availability => {
  const fixture = harness()
  if (availability === 'missing') fixture.options.headset = undefined
  else fixture.options.headsetSupported = false

  await expect(requestVRSession(fixture.options)).rejects.toMatchObject({
    name: 'NotSupportedError',
    message: 'Open this scene in PICO Browser, then choose Connect PICO.',
  })
  expect(fixture.headset.requestSession).not.toHaveBeenCalled()
  expect(fixture.options.loadSimulator).not.toHaveBeenCalled()
  expect(fixture.simulator.requestSession).not.toHaveBeenCalled()
  expect(fixture.options.onMode).toHaveBeenCalledWith('headset')
})

it.each(['supported', 'unsupported', 'missing'] as const)('opens explicitly chosen simulator when native runtime is %s', async availability => {
  const fixture = harness()
  fixture.options.mode = 'simulator'
  if (availability === 'missing') fixture.options.headset = undefined
  if (availability === 'unsupported') fixture.options.headsetSupported = false

  expect(await requestVRSession(fixture.options)).toBe(fixture.simulatorSession)
  expect(fixture.headset.requestSession).not.toHaveBeenCalled()
  expect(fixture.options.loadSimulator).toHaveBeenCalledOnce()
  expect(fixture.simulator.requestSession).toHaveBeenCalledWith('immersive-vr', { requiredFeatures: ['local-floor'] })
  expect(fixture.options.onMode).toHaveBeenCalledWith('simulator')
})

it.each(['NotSupportedError', 'NotFoundError'])('keeps simulator closed after requested headset disappears with %s', async name => {
  const fixture = harness()
  const failure = new DOMException('Headset unavailable.', name)
  fixture.headset.requestSession.mockRejectedValue(failure)

  await expect(requestVRSession(fixture.options)).rejects.toBe(failure)
  expect(fixture.headset.requestSession).toHaveBeenCalledOnce()
  expect(fixture.options.loadSimulator).not.toHaveBeenCalled()
  expect(fixture.simulator.requestSession).not.toHaveBeenCalled()
  expect(fixture.options.onMode).toHaveBeenLastCalledWith('headset')
})

it.each(['NotAllowedError', 'SecurityError'])('preserves native permission failure %s without installing simulator', async name => {
  const fixture = harness()
  const failure = new DOMException('Permission denied.', name)
  fixture.headset.requestSession.mockRejectedValue(failure)

  await expect(requestVRSession(fixture.options)).rejects.toBe(failure)
  expect(fixture.options.loadSimulator).not.toHaveBeenCalled()
  expect(fixture.simulator.requestSession).not.toHaveBeenCalled()
})

it('preserves unexpected native runtime failure instead of treating it as absent headset', async () => {
  const fixture = harness()
  const failure = new Error('XR runtime failed.')
  fixture.headset.requestSession.mockRejectedValue(failure)

  await expect(requestVRSession(fixture.options)).rejects.toBe(failure)
  expect(fixture.options.loadSimulator).not.toHaveBeenCalled()
})

it.each(['headset', 'simulator'] as const)('does not start requested %s when scene already unmounted', async mode => {
  const fixture = harness()
  fixture.options.mode = mode
  fixture.options.isCurrent.mockReturnValue(false)

  expect(await requestVRSession(fixture.options)).toBeNull()
  expect(fixture.headset.requestSession).not.toHaveBeenCalled()
  expect(fixture.options.loadSimulator).not.toHaveBeenCalled()
})

it('does not create late simulator session after scene unmounts during import', async () => {
  const fixture = harness()
  const loading = deferred<Pick<XRSystem, 'requestSession'> | null>()
  fixture.options.mode = 'simulator'
  fixture.options.loadSimulator.mockReturnValue(loading.promise)
  const pending = requestVRSession(fixture.options)
  expect(fixture.options.loadSimulator).toHaveBeenCalledOnce()

  fixture.options.isCurrent.mockReturnValue(false)
  loading.resolve(fixture.simulator)

  expect(await pending).toBeNull()
  expect(fixture.simulator.requestSession).not.toHaveBeenCalled()
})

it.each(['headset', 'simulator'] as const)('ends %s session granted after scene unmounts', async mode => {
  const fixture = harness()
  const granting = deferred<XRSession>()
  const grantedSession = mode === 'headset' ? fixture.headsetSession : fixture.simulatorSession
  fixture.options.mode = mode
  fixture[mode].requestSession.mockReturnValue(granting.promise)
  const pending = requestVRSession(fixture.options)
  if (mode === 'simulator') {
    // Allow resolved import to reach requestSession before unmounting scene.
    await Promise.resolve()
    expect(fixture.simulator.requestSession).toHaveBeenCalledOnce()
  }

  fixture.options.isCurrent.mockReturnValue(false)
  granting.resolve(grantedSession)

  expect(await pending).toBeNull()
  expect(grantedSession.end).toHaveBeenCalledOnce()
  if (mode === 'headset') expect(fixture.options.loadSimulator).not.toHaveBeenCalled()
})

it('preserves simulator loading failure without requesting session', async () => {
  const fixture = harness()
  const failure = new Error('Simulator chunk unavailable.')
  fixture.options.mode = 'simulator'
  fixture.options.loadSimulator.mockRejectedValue(failure)

  await expect(requestVRSession(fixture.options)).rejects.toBe(failure)
  expect(fixture.simulator.requestSession).not.toHaveBeenCalled()
})

it('preserves simulator session failure without retrying import', async () => {
  const fixture = harness()
  const failure = new DOMException('WebGL session unavailable.', 'NotSupportedError')
  fixture.options.mode = 'simulator'
  fixture.simulator.requestSession.mockRejectedValue(failure)

  await expect(requestVRSession(fixture.options)).rejects.toBe(failure)
  expect(fixture.options.loadSimulator).toHaveBeenCalledOnce()
  expect(fixture.simulator.requestSession).toHaveBeenCalledOnce()
})

it('returns null when simulator installation was cancelled', async () => {
  const fixture = harness()
  fixture.options.mode = 'simulator'
  fixture.options.loadSimulator.mockResolvedValue(null)

  expect(await requestVRSession(fixture.options)).toBeNull()
  expect(fixture.simulator.requestSession).not.toHaveBeenCalled()
})
