import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { PersonIcon, ArrowsOutCardinal, ArrowClockwise } from '@phosphor-icons/react'
import { activeClip, clipRoot, restoreActorClips, splitActorClip, type ActorClip, type ClipKind, type DirectorTimeline } from '../modules/motion/directorTimeline'
import { updateTimeline, useMotionStore } from '../modules/motion/store'
import { formatTimecode } from '../modules/motion/timelineMath'
import { isEditableTarget } from '../utils/dom'
import { useSceneEditorStore } from '../modules/scene/editorStore'
import './director-timeline.css'

const ACTION_NAMES: Record<ClipKind, string> = { saved: 'Fight & fall', walk: 'Walk', idle: 'Hold' }

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="actor-field"><span>{label}</span>{children}</label>
}

function NumberField({ label, value, onCommit, step = 0.1, min, max, suffix }: { label: string; value: number; onCommit: (value: number) => void; step?: number; min?: number; max?: number; suffix?: string }) {
  const [draft, setDraft] = useState(String(Number(value.toFixed(4))))
  const focused = useRef(false)
  const cancelBlur = useRef(false)
  useEffect(() => { if (!focused.current) setDraft(String(Number(value.toFixed(4)))) }, [value])
  return <Field label={label}><div className="actor-number-control"><input aria-label={label} type="number" min={min} max={max} step={step} value={draft} onFocus={() => { focused.current = true }} onChange={event => setDraft(event.target.value)} onBlur={event => {
    focused.current = false
    const next = event.target.value.trim() === '' ? NaN : Number(event.target.value)
    if (!cancelBlur.current && Number.isFinite(next) && next !== value) onCommit(next)
    cancelBlur.current = false
    setDraft(String(Number(value.toFixed(4))))
  }} onKeyDown={event => {
    if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() }
    if (event.key === 'Escape') { event.preventDefault(); cancelBlur.current = true; event.currentTarget.blur() }
  }} />{suffix && <span>{suffix}</span>}</div></Field>
}

export function ActorInspector({ actor, onSelectActor }: { actor: number; onSelectActor: (actor: number) => void }) {
  const actorMode = useSceneEditorStore(state => state.actorMode)
  const timeline = useMotionStore(state => state.timeline)
  const selected = useMotionStore(state => state.selectedClipId)
  const frame = useMotionStore(state => state.frame)
  const fps = useMotionStore(state => state.fps)
  const status = useMotionStore(state => state.status)
  const sourceMotion = useMotionStore(state => state.sourceMotion)
  const sourceFrameCount = useMotionStore(state => state.sourceFrameCount)
  const pick = useMotionStore(state => state.pathPick)
  const [error, setError] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const track = timeline?.actors.find(item => item.actor === actor)
  const clip = track?.clips.find(item => item.id === selected) ?? track?.clips[0]

  useEffect(() => {
    if (clip && clip.id !== selected) useMotionStore.setState({ selectedClipId: clip.id })
  }, [clip?.id, selected])

  if (status !== 'ready' || !timeline || !track || !clip || !sourceMotion) return <div className="scene-inspector-content actor-inspector"><p className="actor-help">Actor controls load with scene motion.</p></div>

  function selectClip(clipId: string) {
    onSelectActor(actor)
    useMotionStore.setState({ selectedClipId: clipId, playing: false, pathPick: null })
    setError('')
  }

  function save(next: DirectorTimeline) {
    try { updateTimeline(next); setError(''); return true }
    catch { setError('Check action times, source frames and overlapping clips.'); return false }
  }

  function patch(changes: Partial<ActorClip>) {
    const current = useMotionStore.getState().timeline
    if (!current || !clip) return
    const next = structuredClone(current)
    const target = next.actors.find(item => item.actor === actor)?.clips.find(item => item.id === clip.id)
    if (!target) return
    Object.assign(target, changes)
    save(next)
  }

  function pickPoint(edge: 'from' | 'to') {
    if (!clip) return
    onSelectActor(actor)
    useMotionStore.setState({ selectedClipId: clip.id, pathPick: { clipId: clip.id, edge }, playing: false })
  }

  function append(kind: 'walk' | 'idle') {
    const current = useMotionStore.getState()
    if (!current.timeline || !current.sourceMotion) return
    const next = structuredClone(current.timeline)
    const target = next.actors.find(item => item.actor === actor)!
    const last = [...target.clips].sort((a, b) => b.endFrame - a.endFrame)[0]
    const point = clipRoot(last, actor, last.endFrame - 1, current.sourceMotion)
    const yaw = last.kind === 'walk' && Math.hypot(last.to[0] - last.from[0], last.to[1] - last.from[1]) > 0.001 ? Math.atan2(last.to[0] - last.from[0], last.to[1] - last.from[1]) + last.yaw : last.yaw
    const id = crypto.randomUUID()
    target.clips.push({ ...last, id, kind, prompt: kind === 'walk' ? 'Walk to destination.' : 'Hold position.', startFrame: last.endFrame, endFrame: last.endFrame + fps * 2, from: point, to: [...point], yaw: kind === 'walk' ? 0 : yaw, native: false, walkPhaseFrame: 0 })
    next.frameCount = Math.max(next.frameCount, last.endFrame + fps * 2)
    if (!save(next)) return
    selectClip(id)
    if (kind === 'walk') useMotionStore.setState({ pathPick: { clipId: id, edge: 'to' }, playing: false })
  }

  function split() {
    const current = useMotionStore.getState()
    if (!current.timeline || !current.sourceMotion || !clip) return
    if (current.frame <= clip.startFrame || current.frame >= clip.endFrame - 1) { setError('Move playhead inside selected clip to split.'); return }
    const next = structuredClone(current.timeline)
    const clips = next.actors.find(item => item.actor === actor)!.clips
    clips.splice(clips.findIndex(item => item.id === clip.id), 1, ...splitActorClip(clip, actor, current.frame, current.sourceMotion, crypto.randomUUID()))
    save(next)
  }

  function remove() {
    const current = useMotionStore.getState().timeline
    if (!current || !clip) return
    const next = structuredClone(current)
    const target = next.actors.find(item => item.actor === actor)!
    if (target.clips.length <= 1) { setError('Keep at least one action for each actor.'); return }
    target.clips = target.clips.filter(item => item.id !== clip.id)
    if (save(next)) selectClip(target.clips[0].id)
  }

  function keyboard(event: KeyboardEvent<HTMLElement>) {
    if (isEditableTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); event.stopPropagation(); remove() }
    else if (event.key.toLowerCase() === 's') { event.preventDefault(); event.stopPropagation(); split() }
  }

  function exportFile() {
    const current = useMotionStore.getState().timeline
    if (!current) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(current, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url; link.download = 'scenra-timeline.json'; link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const point = clipRoot(activeClip(track, frame), actor, frame, sourceMotion)
  return <><header className="scene-inspector-heading editor-panel-heading"><h1><PersonIcon size={14} />{track.name}</h1><span className="scene-muted">Actor</span></header><div className="scene-inspector-content actor-inspector" onKeyDown={keyboard}>
    <section className="actor-control-module editor-module" aria-label="Actor control">
      <header className="actor-module-heading"><h2>Actor control</h2></header>
      <Field label="Actor name"><input aria-label="Actor name" maxLength={80} value={track.name} onChange={event => {
        const current = useMotionStore.getState().timeline
        if (!current) return
        const next = structuredClone(current)
        next.actors.find(item => item.actor === actor)!.name = event.target.value
        save(next)
      }} /></Field>
      <div className="actor-position-readout"><span>Current position</span><output>X {point[0].toFixed(2)} · Z {point[1].toFixed(2)}</output><span>{formatTimecode(frame, fps)}</span></div>
      <div className="editor-segmented editor-transform-tools"><button aria-pressed={actorMode === 'translate'} onClick={() => useSceneEditorStore.setState({ actorMode: 'translate' })}><ArrowsOutCardinal size={15} />Move</button><button aria-pressed={actorMode === 'rotate'} onClick={() => useSceneEditorStore.setState({ actorMode: 'rotate' })}><ArrowClockwise size={15} />Rotate</button></div>
      <p className="actor-help">{actorMode === 'translate' ? 'Drag X or Z arrows to move current action across scene.' : 'Drag Y ring to change facing at current frame.'}</p>
    </section>
    <section className="actor-action-module editor-module" aria-label="Action settings" key={clip.id}>
      <header className="actor-module-heading"><h2>Action settings</h2><span>{track.clips.length} {track.clips.length === 1 ? 'clip' : 'clips'}</span></header>
      <Field label="Selected clip"><select aria-label="Selected action clip" value={clip.id} onChange={event => selectClip(event.target.value)}>{[...track.clips].sort((a, b) => a.startFrame - b.startFrame).map(item => <option key={item.id} value={item.id}>{ACTION_NAMES[item.kind]} · {(item.startFrame / fps).toFixed(1)}–{(item.endFrame / fps).toFixed(1)}s</option>)}</select></Field>
      <Field label="Action"><select aria-label="Clip action" value={clip.kind} onChange={event => patch({ kind: event.target.value as ClipKind, native: false })}>{Object.entries(ACTION_NAMES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
      <div className="actor-fields-grid"><NumberField label="Start" value={clip.startFrame / fps} min={0} max={(clip.endFrame - 1) / fps} step={1 / fps} suffix="s" onCommit={value => patch({ startFrame: Math.round(value * fps) })} /><NumberField label="End" value={clip.endFrame / fps} min={(clip.startFrame + 1) / fps} max={timeline.frameCount / fps} step={1 / fps} suffix="s" onCommit={value => patch({ endFrame: Math.round(value * fps) })} /></div>
      <div className="actor-path-settings"><div className="actor-path-heading"><h3>Blocking</h3><span>Scene position</span></div><div className="actor-fields-grid"><button type="button" aria-pressed={pick?.clipId === clip.id && pick.edge === 'from'} onClick={() => pickPoint('from')}>Pick start</button><button type="button" aria-pressed={pick?.clipId === clip.id && pick.edge === 'to'} onClick={() => pickPoint('to')}>Pick destination</button></div>
        <div className="actor-fields-grid">{(['from', 'to'] as const).flatMap(edge => ([0, 1] as const).map(axis => <NumberField key={`${edge}-${axis}`} label={`${edge === 'from' ? 'Start' : 'End'} ${axis === 0 ? 'X' : 'Z'}`} value={clip[edge][axis]} min={-1000} max={1000} onCommit={value => { const next = [...clip[edge]] as [number, number]; next[axis] = value; patch({ [edge]: next, native: false }) }} />))}</div>
        <NumberField label="Facing offset" value={clip.yaw * 180 / Math.PI} step={5} suffix="°" onCommit={value => patch({ yaw: value * Math.PI / 180 })} />
        {pick?.clipId === clip.id && <div className="actor-pick-status" role="status"><p>Click ground to set {pick.edge === 'from' ? 'start' : 'destination'}.</p><button type="button" onClick={() => useMotionStore.setState({ pathPick: null })}>Cancel</button></div>}
      </div>
      <Field label="Direction note"><textarea aria-label="Direction note" maxLength={2000} rows={3} value={clip.prompt} onChange={event => patch({ prompt: event.target.value })} /></Field>
      <div className="actor-action-buttons"><button type="button" onClick={() => append('walk')}>Add walk</button><button type="button" onClick={() => append('idle')}>Append hold</button><button type="button" title="Split at playhead (S)" onClick={split}>Split at playhead</button><button type="button" disabled={track.clips.length <= 1} title="Delete selected clip (Delete)" onClick={remove}>Delete clip</button></div>
      <details className="actor-advanced"><summary>Source motion</summary>{clip.kind === 'saved' ? <><p className="actor-help">Saved Stageon motion · ARDY</p><p className="actor-help">Start and End change playback duration. Source in and Source out trim recorded frames.</p><div className="actor-fields-grid"><NumberField label="Source in" value={clip.sourceStartFrame} min={0} max={clip.sourceEndFrame} step={1} onCommit={value => patch({ sourceStartFrame: Math.round(value) })} /><NumberField label="Source out" value={clip.sourceEndFrame} min={clip.sourceStartFrame} max={sourceFrameCount - 1} step={1} onCommit={value => patch({ sourceEndFrame: Math.round(value) })} /></div><label className="actor-check"><input type="checkbox" checked={clip.native} onChange={event => patch({ native: event.target.checked })} />Original path</label><p className="actor-help">Original path follows recorded motion. Position edits place action within scene.</p></> : <p className="actor-help">{clip.kind === 'walk' ? 'Local walk cycle follows start and destination.' : 'Local hold pose stays at selected position.'}</p>}</details>
      <details className="actor-advanced"><summary>Timeline file</summary><div className="actor-file-actions"><button type="button" onClick={() => {
        const current = useMotionStore.getState()
        if (!current.original || !current.timeline) return
        const restored = restoreActorClips(current.timeline, current.original, actor, () => crypto.randomUUID())
        if (save(restored)) selectClip(restored.actors.find(item => item.actor === actor)!.clips[0].id)
      }}>Original action</button><button type="button" onClick={exportFile}>Export JSON</button><button type="button" onClick={() => file.current?.click()}>Import JSON</button></div><p className="actor-help">Timeline changes save in this browser.</p></details>
    </section>
    <input ref={file} hidden type="file" accept="application/json,.json" aria-label="Import timeline JSON" onChange={async event => {
      const input = event.target
      const value = input.files?.[0]
      if (value) try {
        if (value.size > 1024 * 1024) throw new Error('Timeline file is too large.')
        updateTimeline(JSON.parse(await value.text()))
        const next = useMotionStore.getState().timeline?.actors.find(item => item.actor === actor)?.clips[0]
        if (next) selectClip(next.id)
        setError('')
      } catch { setError('Invalid timeline JSON. Check actor count, action ranges and source frames.') }
      input.value = ''
    }} />
    {error && <p className="actor-error" role="alert">{error}</p>}
  </div></>
}
