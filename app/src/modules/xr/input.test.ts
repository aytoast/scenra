import { expect, it } from 'vitest'
import { selectionStep, thumbstick } from './input'

it('reads xr-standard sticks and two-axis profiles with drift deadzone', () => {
  expect(thumbstick([0, 0, 0.8, -0.7])).toEqual({ x: 0.8, y: -0.7 })
  expect(thumbstick([-0.9, 0.6])).toEqual({ x: -0.9, y: 0.6 })
  expect(thumbstick([0.1, -0.12])).toEqual({ x: 0, y: 0 })
})

it('cycles one prop per deliberate deflection and rearms after neutral', () => {
  expect(selectionStep(0.9, true)).toEqual({ step: 1, armed: false })
  expect(selectionStep(0.9, false)).toEqual({ step: 0, armed: false })
  expect(selectionStep(0.1, false)).toEqual({ step: 0, armed: true })
  expect(selectionStep(-0.9, true)).toEqual({ step: -1, armed: false })
})
