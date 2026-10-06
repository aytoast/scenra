import { Fragment, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { ArrowCounterClockwiseIcon, CaretDownIcon, PauseIcon, PersonIcon, PlayIcon } from '@phosphor-icons/react'
import { splitActorClip, type ActorClip, type DirectorTimeline as TimelineData } from '../modules/motion/directorTimeline'
import { seekMotion, updateTimeline, useMotionStore } from '../modules/motion/store'
import { formatTimecode, frameFromPointer, timelineTickFrames } from '../modules/motion/timelineMath'
import { isEditableTarget } from '../utils/dom'
import { chrome } from './AppChrome'
import './director-timeline.css'

const ACTION_NAMES = { saved: 'Fight & fall', walk: 'Walk', idle: 'Hold' }
type FrameRange = Pick<ActorClip, 'startFrame' | 'endFrame'>
type ClipDrag = { kind: 'move' | 'start' | 'end'; actor: number; clipId: string; range: FrameRange; pointerFrame: number; minFrame: number; maxFrame: number }
type Drag = { target: HTMLElement; pointerId: number; left: number; width: number; frameCount: number } & ({ kind: 'scrub' } | ClipDrag)
type Draft = FrameRange & { clipId: string }

/** Timeline ends are exclusive; every resized clip retains at least one frame. */
export function clampClipRange(range: FrameRange, kind: ClipDrag['kind'], frame: number, pointerFrame: number, minFrame: number, maxFrame: number): FrameRange {
  if (kind === 'start') return { ...range, startFrame: Math.max(minFrame, Math.min(range.endFrame - 1, Math.round(frame))) }
  if (kind === 'end') return { ...range, endFrame: Math.max(range.startFrame + 1, Math.min(maxFrame, Math.round(frame))) }
  const duration = range.endFrame - range.startFrame
  const startFrame = Math.max(minFrame, Math.min(maxFrame - duration, range.startFrame + Math.round(frame - pointerFrame)))
  return { startFrame, endFrame: startFrame + duration }
}

export function DirectorTimeline({ onSelectActor, onCollapse }: { onSelectActor: (actor: number) => void; onCollapse: () => void }) {
  const timeline = useMotionStore(state => state.timeline)
  const frame = useMotionStore(state => state.frame)
  const fps = useMotionStore(state => state.fps)
  const playing = useMotionStore(state => state.playing)
  const selected = useMotionStore(state => state.selectedClipId)
  const status = useMotionStore(state => state.status)
  const panel = useRef<HTMLElement>(null)
  const axis = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const draftRef = useRef<Draft | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const element = panel.current
    const workspace = element?.closest<HTMLElement>('.scene-workspace')
    if (!element || !workspace) return
    const measure = () => workspace.style.setProperty('--timeline-height', `${Math.ceil(element.getBoundingClientRect().height) + (innerWidth <= 700 ? 24 : 32)}px`)
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    measure()
    return () => { observer.disconnect(); workspace.style.removeProperty('--timeline-height') }
  }, [status, Boolean(timeline)])

  if (!timeline || status !== 'ready') return null

  function selectClip(actor: number, clipId: string) {
    onSelectActor(actor)
    useMotionStore.setState({ selectedClipId: clipId, playing: false, pathPick: null })
    setError('')
  }

  function save(next: TimelineData) {
    try { updateTimeline(next); setError(''); return true }
    catch { setError('Clips must stay within timeline and cannot overlap.'); return false }
  }

  function beginDrag(event: PointerEvent<HTMLElement>, clipDrag?: ClipDrag) {
    if (event.button !== 0 || !axis.current || !timeline) return
    event.preventDefault()
    event.stopPropagation()
    const rect = axis.current.getBoundingClientRect()
    if (rect.width <= 0) return
    useMotionStore.setState({ playing: false, pathPick: null })
    event.currentTarget.focus({ preventScroll: true })
    event.currentTarget.setPointerCapture(event.pointerId)
    draftRef.current = null
    drag.current = { target: event.currentTarget, pointerId: event.pointerId, left: rect.left, width: rect.width, frameCount: timeline.frameCount, ...(clipDrag ?? { kind: 'scrub' as const }) }
    if (!clipDrag) seekMotion(frameFromPointer(event.clientX, rect.left, rect.width, timeline.frameCount))
  }

  function beginClipDrag(event: PointerEvent<HTMLElement>, actor: number, clip: ActorClip, kind: ClipDrag['kind']) {
    if (event.button !== 0 || !timeline || !axis.current) return
    const clips = [...timeline.actors.find(track => track.actor === actor)!.clips].sort((a, b) => a.startFrame - b.startFrame)
    const index = clips.findIndex(item => item.id === clip.id)
    const rect = axis.current.getBoundingClientRect()
    selectClip(actor, clip.id)
    beginDrag(event, { kind, actor, clipId: clip.id, range: { startFrame: clip.startFrame, endFrame: clip.endFrame }, pointerFrame: frameFromPointer(event.clientX, rect.left, rect.width, timeline.frameCount), minFrame: clips[index - 1]?.endFrame ?? 0, maxFrame: clips[index + 1]?.startFrame ?? timeline.frameCount })
  }

  function continueDrag(event: PointerEvent<HTMLElement>) {
    const active = drag.current
    if (!active || active.pointerId !== event.pointerId) return
    event.preventDefault()
    const pointerFrame = frameFromPointer(event.clientX, active.left, active.width, active.frameCount)
    if (active.kind === 'scrub') { seekMotion(pointerFrame); return }
    const next = { clipId: active.clipId, ...clampClipRange(active.range, active.kind, pointerFrame, active.pointerFrame, active.minFrame, active.maxFrame) }
    draftRef.current = next
    setDraft(next)
  }

  function finishDrag(event: PointerEvent<HTMLElement>, cancelled = false) {
    const active = drag.current
    if (!active || active.pointerId !== event.pointerId) return
    const nextRange = draftRef.current
    drag.current = null
    draftRef.current = null
    setDraft(null)
    if (active.target.hasPointerCapture(event.pointerId)) active.target.releasePointerCapture(event.pointerId)
    if (cancelled || active.kind === 'scrub' || !nextRange) return
    const current = useMotionStore.getState().timeline
    if (!current) return
    const next = structuredClone(current)
    const clip = next.actors.find(track => track.actor === active.actor)?.clips.find(item => item.id === active.clipId)
    if (!clip || (clip.startFrame === nextRange.startFrame && clip.endFrame === nextRange.endFrame)) return
    Object.assign(clip, { startFrame: nextRange.startFrame, endFrame: nextRange.endFrame })
    save(next)
  }

  function keyboard(event: KeyboardEvent<HTMLElement>) {
    if (isEditableTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return
    const current = useMotionStore.getState()
    const track = current.timeline?.actors.find(item => item.clips.some(clip => clip.id === current.selectedClipId))
    const clip = track?.clips.find(item => item.id === current.selectedClipId)
    if (!track || !clip || !current.timeline) return
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault(); event.stopPropagation()
      if (track.clips.length <= 1) { setError('Keep at least one action for each actor.'); return }
      const next = structuredClone(current.timeline)
      const target = next.actors.find(item => item.actor === track.actor)!
      target.clips = target.clips.filter(item => item.id !== clip.id)
      if (save(next)) selectClip(track.actor, target.clips[0].id)
    } else if (event.key.toLowerCase() === 's') {
      event.preventDefault(); event.stopPropagation()
      if (!current.sourceMotion || current.frame <= clip.startFrame || current.frame >= clip.endFrame - 1) { setError('Move playhead inside selected clip to split.'); return }
      const next = structuredClone(current.timeline)
      const clips = next.actors.find(item => item.actor === track.actor)!.clips
      clips.splice(clips.findIndex(item => item.id === clip.id), 1, ...splitActorClip(clip, track.actor, current.frame, current.sourceMotion, crypto.randomUUID()))
      save(next)
    }
  }

  const ticks = timelineTickFrames(timeline.frameCount, fps, 2)
  const gridStep = Math.max(1, Math.round(fps / 2)) / timeline.frameCount * 100
  const laneStyle = { '--timeline-grid-step': `${gridStep}%` } as CSSProperties
  const activeActor = timeline.actors.find(track => track.clips.some(clip => clip.id === selected))?.actor

  return <section ref={panel} className={`director-timeline ${chrome.panel}`} aria-label="Animation timeline" onKeyDown={keyboard} onPointerMove={continueDrag} onPointerUp={event => finishDrag(event)} onPointerCancel={event => finishDrag(event, true)} onLostPointerCapture={event => finishDrag(event, true)}>
    <div className="timeline-transport">
      <div className="timeline-transport-actions">
        <button type="button" className="timeline-transport-button" aria-label={playing ? 'Pause animation' : 'Play animation'} title={playing ? 'Pause' : 'Play'} onClick={() => useMotionStore.setState({ playing: !playing })}>{playing ? <PauseIcon size={15} /> : <PlayIcon size={15} />}</button>
        <button type="button" className="timeline-transport-button" aria-label="Restart animation" title="Restart" onClick={() => { useMotionStore.setState({ playing: false }); seekMotion(0) }}><ArrowCounterClockwiseIcon size={15} /></button>
        <output className="timeline-timecode" aria-label="Animation timecode">{formatTimecode(frame, fps)}<span> / {formatTimecode(timeline.frameCount, fps)}</span></output>
      </div>
      <button type="button" className="timeline-transport-button" aria-label="Hide timeline" title="Hide timeline" onClick={onCollapse}><CaretDownIcon size={15} /></button>
    </div>
    <div className="timeline-tracks" style={laneStyle}>
      <div className="timeline-ruler">
        <div className="timeline-ruler-label" aria-hidden="true" />
        <div ref={axis} className="timeline-ruler-lane" onPointerDown={event => beginDrag(event)}>
          {ticks.map(tick => <span key={tick} className={`timeline-tick${tick === 0 ? ' first' : tick === timeline.frameCount ? ' last' : ''}`} style={{ left: `${tick / timeline.frameCount * 100}%` }}>{Number((tick / fps).toFixed(2))}s</span>)}
        </div>
      </div>
      {timeline.actors.map(track => <Fragment key={track.actor}>
        <div className={`timeline-track-row timeline-actor-row${activeActor === track.actor ? ' selected' : ''}`}>
          <button type="button" className="timeline-track-label actor-name" aria-pressed={activeActor === track.actor} onClick={() => selectClip(track.actor, track.clips.find(item => item.id === selected)?.id ?? track.clips[0].id)}><CaretDownIcon size={10} /><PersonIcon size={13} /><span>{track.name}</span></button>
          <div className="timeline-lane timeline-summary-lane" onPointerDown={event => beginDrag(event)}>{track.clips.map(item => <span key={item.id} className="timeline-summary-clip" style={{ left: `${item.startFrame / timeline.frameCount * 100}%`, width: `${(item.endFrame - item.startFrame) / timeline.frameCount * 100}%` }} />)}</div>
        </div>
        <div className="timeline-track-row timeline-animation-row">
          <button type="button" className="timeline-track-label animation-name" onClick={() => selectClip(track.actor, track.clips.find(item => item.id === selected)?.id ?? track.clips[0].id)}>Animation</button>
          <div className="timeline-lane timeline-animation-lane" onPointerDown={event => { if (event.target === event.currentTarget) beginDrag(event) }}>
            {track.clips.map(item => {
              const range = draft?.clipId === item.id ? draft : item
              return <button type="button" key={item.id} className={`timeline-clip ${item.kind}${draft?.clipId === item.id ? ' dragging' : ''}`} aria-label={`${track.name}: ${ACTION_NAMES[item.kind]}`} aria-pressed={selected === item.id} style={{ left: `${range.startFrame / timeline.frameCount * 100}%`, width: `${(range.endFrame - range.startFrame) / timeline.frameCount * 100}%` }} title={`${ACTION_NAMES[item.kind]} · ${(range.startFrame / fps).toFixed(2)}–${(range.endFrame / fps).toFixed(2)}s`} onPointerDown={event => beginClipDrag(event, track.actor, item, 'move')} onClick={event => { if (event.detail === 0) selectClip(track.actor, item.id) }}>
                <span className="timeline-clip-handle start" title="Drag to change action start" onPointerDown={event => beginClipDrag(event, track.actor, item, 'start')} />
                <span className="timeline-clip-label">{ACTION_NAMES[item.kind]}</span>
                <span className="timeline-clip-handle end" title="Drag to change action end" onPointerDown={event => beginClipDrag(event, track.actor, item, 'end')} />
              </button>
            })}
          </div>
        </div>
      </Fragment>)}
      <div className="timeline-playhead-area">
        <div className="timeline-playhead" style={{ left: `${frame / timeline.frameCount * 100}%` }}>
          <button type="button" className="timeline-playhead-cap" role="slider" aria-label="Timeline playhead" aria-valuemin={0} aria-valuemax={timeline.frameCount - 1} aria-valuenow={frame} aria-valuetext={formatTimecode(frame, fps)} title={formatTimecode(frame, fps)} onPointerDown={event => beginDrag(event)} onKeyDown={event => {
            const next = event.key === 'ArrowLeft' ? frame - 1 : event.key === 'ArrowRight' ? frame + 1 : event.key === 'Home' ? 0 : event.key === 'End' ? timeline.frameCount - 1 : null
            if (next === null) return
            event.preventDefault(); event.stopPropagation(); useMotionStore.setState({ playing: false }); seekMotion(next)
          }} />
          <span className="timeline-playhead-line" />
        </div>
      </div>
    </div>
    {error && <p className="timeline-error" role="alert">{error}</p>}
  </section>
}
