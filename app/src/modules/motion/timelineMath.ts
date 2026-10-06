export type FrameRange = {
  startFrame: number
  endFrame: number
}

export type TimelineMotionPlacement = {
  startFrame: number
  sourceStartFrame: number
  sourceEndFrame: number
}

export function clampFrame(frame: number, maxFrame: number) {
  return Math.max(0, Math.min(maxFrame, Math.round(frame)))
}

export function formatTimecode(frame: number, fps: number) {
  const safeFps = Math.max(1, Math.round(fps))
  const safeFrame = Math.max(0, Math.round(frame))
  const totalSeconds = Math.floor(safeFrame / safeFps)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const frames = safeFrame % safeFps
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(frames).padStart(2, '0')}`
}

export function timelineTickFrames(maxFrame: number, fps: number, zoom: number) {
  const safeMax = Math.max(0, Math.round(maxFrame))
  const safeFps = Math.max(1, Math.round(fps))
  const targetTickCount = Math.max(4, Math.round(4 * Math.max(1, zoom)))
  const rawStep = safeMax / targetTickCount
  const candidates = [...new Set([
    1,
    2,
    5,
    10,
    Math.max(1, Math.round(safeFps / 2)),
    safeFps,
    safeFps * 2,
    safeFps * 5,
    safeFps * 10,
    safeFps * 30,
    safeFps * 60,
  ])].sort((a, b) => a - b)
  const step = candidates.find((candidate) => candidate >= rawStep)
    ?? Math.max(safeFps, Math.ceil(rawStep / safeFps) * safeFps)
  const ticks = Array.from({ length: Math.floor(safeMax / step) + 1 }, (_, index) => index * step)
  if (ticks[ticks.length - 1] !== safeMax) ticks.push(safeMax)
  return ticks
}
export function frameFromPointer(clientX: number, laneLeft: number, laneWidth: number, maxFrame: number) {
  if (laneWidth <= 0) return 0
  return clampFrame(((clientX - laneLeft) / laneWidth) * maxFrame, maxFrame)
}

export function moveFrameRange(range: FrameRange, delta: number, maxFrame: number): FrameRange {
  const duration = range.endFrame - range.startFrame
  const startFrame = Math.max(0, Math.min(maxFrame - duration, range.startFrame + Math.round(delta)))
  return { startFrame, endFrame: startFrame + duration }
}

export function resizeFrameRange(
  range: FrameRange,
  edge: 'start' | 'end',
  frame: number,
  maxFrame: number,
): FrameRange {
  const value = clampFrame(frame, maxFrame)
  return edge === 'start'
    ? { ...range, startFrame: Math.min(value, range.endFrame) }
    : { ...range, endFrame: Math.max(value, range.startFrame) }
}

export function motionPlacementEnd(placement: TimelineMotionPlacement) {
  return placement.startFrame + placement.sourceEndFrame - placement.sourceStartFrame
}

export function sourceFrameAt(placement: TimelineMotionPlacement, timelineFrame: number) {
  const endFrame = motionPlacementEnd(placement)
  if (timelineFrame < placement.startFrame || timelineFrame > endFrame) return null
  return placement.sourceStartFrame + timelineFrame - placement.startFrame
}
