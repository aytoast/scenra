import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowsClockwiseIcon, ArrowCounterClockwiseIcon, PencilSimpleIcon, PlayIcon, PauseIcon, CaretDownIcon, CaretUpIcon, ArrowLeftIcon, GearSixIcon, CameraIcon } from '@phosphor-icons/react'
import { useLocation } from 'wouter'
import { ObjectRenderMode, ViewerQuality, WorldRenderMode, type WorldEntry, type WorldHoverPreview, type WorldObjectAsset, type WorldSceneProject } from '../types/world'
import { useDebugStore } from '../store/debug'
import { seekMotion, useMotionStore } from '../modules/motion/store'
import { BottomLeftControls, ViewerModeHotkeys } from './BottomLeftControls'
import { WorldSidebar } from './WorldSidebar'
import { chrome } from './AppChrome'
import { VideoRecorder } from './VideoRecorder'
import { VRControls } from './VRControls'
import { DirectorTimeline } from './DirectorTimeline'
import { selectActor, useSceneEditorStore } from '../modules/scene/editorStore'
import './scene-workspace.css'

interface Props {
  children: ReactNode
  worlds: WorldEntry[]
  entry: WorldEntry
  uiVisible: boolean
  editing: boolean
  onPreview: () => Promise<void>
  sceneProject?: WorldSceneProject
  sceneEnabled: boolean
  onSceneToggle: () => void
  worldVersion?: number
  onVersionChange: (index: number) => void
  hoveredObjectAssetId?: string | null
  hoveredObjectInstanceId?: string | null
  onObjectHover: (asset: WorldObjectAsset, hovering: boolean, instanceId?: string) => void
  onWorldHover: (preview: WorldHoverPreview, hovering: boolean) => void
  refreshing: boolean
  onRefresh: () => void
}

export function SceneWorkspace({ children, worlds, entry, uiVisible, editing, onPreview, sceneProject, sceneEnabled, onSceneToggle, worldVersion, onVersionChange, hoveredObjectAssetId, hoveredObjectInstanceId, onObjectHover, onWorldHover, refreshing, onRefresh }: Props) {
  const [, navigate] = useLocation()
  const [timelineOpen, setTimelineOpen] = useState(true)
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [locked, setLocked] = useState(false)
  const [captureError, setCaptureError] = useState('')
  const [saving, setSaving] = useState(false)
  const settingsOpen = useSceneEditorStore(state => state.settingsOpen)
  const viewport = useRef<HTMLDivElement>(null)
  const resetObjects = useDebugStore(state => state.resetObjects)
  const reset = () => { resetObjects(); seekMotion(0) }
  const hasTimeline = editing && uiVisible && timelineOpen && Boolean(entry.project.motion)
  useEffect(() => { setTimelineOpen(true); useMotionStore.setState({ selectedClipId: '', pathPick: null }); useSceneEditorStore.setState({ selection: { kind: 'actor', actor: 0 }, settingsOpen: false }) }, [entry.slug])
  useEffect(() => {
    useMotionStore.setState({ playing: !editing, pathPick: null })
    useSceneEditorStore.setState({ hoveredActor: null })
    if (document.pointerLockElement) document.exitPointerLock()
  }, [editing])
  useEffect(() => {
    const element = viewport.current
    const changed = () => setLocked(Boolean(document.pointerLockElement && element?.contains(document.pointerLockElement)))
    document.addEventListener('pointerlockchange', changed)
    return () => { document.removeEventListener('pointerlockchange', changed); if (document.pointerLockElement && element?.contains(document.pointerLockElement)) document.exitPointerLock() }
  }, [entry.slug])
  const captureMouse = () => {
    setCaptureError('')
    const canvas = viewport.current?.querySelector('canvas')
    try { canvas?.requestPointerLock()?.catch(() => setCaptureError('Right-drag to rotate view.')) }
    catch { setCaptureError('Right-drag to rotate view.') }
  }
  const showcase = new URLSearchParams(location.search).get('showcase')
  if (showcase) return <div className="scene-workspace scenra-showcase"><main className="scene-stage"><div className="scene-viewport">{children}</div></main></div>
  return <div className={`scene-workspace ${editing ? 'scene-editing' : 'scene-preview'} ${hasTimeline ? 'timeline-open' : ''}`}>
    <ViewerModeHotkeys />
    <main className="scene-stage" aria-label={entry.project.display_name ?? entry.slug}>
      <div className="scene-viewport" ref={viewport}>{children}
        {!entry.world && !entry.objectAssets.length && <div className="scene-empty">Scene has no generated assets.</div>}
        {locked && <span className="scene-crosshair" aria-hidden="true" />}
      </div>
    </main>
    {!editing && <><VideoRecorder viewport={viewport} visible={uiVisible} /><VRControls visible={uiVisible} /></>}
    {uiVisible && <>
      {!editing && <div className="scene-library"><WorldSidebar
        worlds={worlds} activeSlug={entry.slug} compact={editing}
        activeSceneProject={sceneProject} activeSceneProjectEnabled={sceneEnabled}
        onActiveSceneProjectToggle={onSceneToggle}
        activeWorldVersionIndex={worldVersion} onActiveWorldVersionChange={onVersionChange}
        hoveredObjectAssetId={hoveredObjectAssetId} hoveredObjectInstanceId={hoveredObjectInstanceId}
        onObjectHover={onObjectHover} onWorldHover={onWorldHover} onReset={reset}
      /></div>}
      {editing && <header className={`scene-editor-heading ${chrome.panel}`}>
        <span><PencilSimpleIcon size={16} />Edit Scene</span>
        <span className="scene-editor-world">{entry.project.display_name ?? entry.slug}</span>
        <button className="scene-settings-button" aria-pressed={settingsOpen} onClick={() => { useMotionStore.setState({ pathPick: null }); useSceneEditorStore.setState({ settingsOpen: !settingsOpen }) }}><GearSixIcon size={16} />Settings</button>
        <button disabled={saving} onClick={async () => { setSaving(true); try { await onPreview() } finally { setSaving(false) } }}><ArrowLeftIcon size={16} />{saving ? 'Saving…' : 'Save & Preview'}</button>
      </header>}
      {!editing && <aside className={`scene-inspector ${chrome.panel} ${chrome.enter}`} aria-label="Camera controls">
        <div className="scene-inspector-heading"><h1><CameraIcon size={16} />Perspective Camera</h1>
          <div className="scene-tools">
            {import.meta.env.DEV && <button aria-label="Reload assets" title="Reload assets" onClick={onRefresh} disabled={refreshing}><ArrowsClockwiseIcon size={16} /></button>}
            <button aria-label={inspectorOpen ? 'Collapse scene controls' : 'Expand scene controls'} aria-expanded={inspectorOpen} onClick={() => setInspectorOpen(open => !open)}>{inspectorOpen ? <CaretUpIcon size={16} /> : <CaretDownIcon size={16} />}</button>
          </div>
        </div>
        {inspectorOpen && <><div className="scene-inspector-content">
          <ViewSettings /><button className="scene-edit-button" onClick={() => navigate(`/${entry.slug}/edit`)}><PencilSimpleIcon size={16} />Edit Scene</button>
        </div>{entry.project.motion && <MotionTransport />}</>}
      </aside>}
      <div className="scene-display-controls"><BottomLeftControls /></div>
      {!editing && <div className={`scene-navigation ${chrome.panel} ${chrome.enter}`}><div><button onClick={captureMouse} disabled={locked}>{locked ? 'ESC releases mouse' : 'Mouse look'}</button><span>WASD move · E/Q up/down · F fast</span></div><p>Right-drag rotate · Middle-drag pan · Left-drag grab · Wheel FOV</p>{captureError && <p role="status">{captureError}</p>}</div>}
      {editing && !timelineOpen && entry.project.motion && <button className={`scene-timeline-reopen ${chrome.panel}`} onClick={() => setTimelineOpen(true)}>Show timeline</button>}
    </>}
    {hasTimeline && <DirectorTimeline onSelectActor={selectActor} onCollapse={() => setTimelineOpen(false)} />}
  </div>
}

export function ViewSettings() {
  const fieldOfView = useDebugStore((state) => state.fieldOfView)
  const setFieldOfView = useDebugStore((state) => state.setFieldOfView)
  const quality = useDebugStore((state) => state.viewerQuality)
  const setQuality = useDebugStore((state) => state.setViewerQuality)
  const worldMode = useDebugStore((state) => state.worldRenderMode)
  const setWorldMode = useDebugStore((state) => state.setWorldRenderMode)
  const objectMode = useDebugStore((state) => state.objectRenderMode)
  const setObjectMode = useDebugStore((state) => state.setObjectRenderMode)
  return <>
    <h2>Perspective</h2><label className="scene-field">Field of view <span className="scene-value">{Math.round(fieldOfView)}°</span><input aria-label="Field of view" type="range" min={35} max={100} value={fieldOfView} onChange={(event) => setFieldOfView(Number(event.target.value))} /></label>
    <label className="scene-field">View<select value={worldMode} onChange={(event) => setWorldMode(event.target.value as WorldRenderMode)}><option value={WorldRenderMode.Combined}>World + objects</option><option value={WorldRenderMode.SplatOnly}>World</option><option value={WorldRenderMode.ObjectOnly}>Objects</option></select></label>
    <label className="scene-field">Object surface<select value={objectMode} onChange={(event) => setObjectMode(event.target.value as ObjectRenderMode)}><option value={ObjectRenderMode.Lit}>Textured</option><option value={ObjectRenderMode.ShadedWireframe}>Shaded wireframe</option><option value={ObjectRenderMode.Wireframe}>Wireframe</option></select></label>
    <label className="scene-field">Quality<select value={quality} onChange={(event) => setQuality(event.target.value as ViewerQuality)}><option value={ViewerQuality.High}>High</option><option value={ViewerQuality.Low}>Low</option></select></label>
    <div className="scene-help"><h3>Camera controls</h3><p>WASD moves camera. Right-drag rotates, middle-drag pans, wheel changes FOV.</p><span>Backquote hides interface.</span></div>
  </>
}

export function MotionSettings({ available }: { available: boolean }) {
  const status = useMotionStore((state) => state.status)
  const error = useMotionStore((state) => state.error)
  const visible = useMotionStore((state) => state.visible)
  const loop = useMotionStore((state) => state.loop)
  const collisions = useMotionStore((state) => state.collisions)
  if (!available) return <p className="scene-muted">No saved motion in this scene.</p>
  return <><h2>Playback & collisions</h2>
    <label className="scene-check"><input type="checkbox" checked={visible} onChange={(event) => useMotionStore.setState({ visible: event.target.checked })} />Show performers</label>
    <label className="scene-check"><input type="checkbox" checked={loop} onChange={(event) => useMotionStore.setState({ loop: event.target.checked })} />Loop playback</label>
    <label className="scene-check"><input type="checkbox" checked={collisions} onChange={(event) => useMotionStore.setState({ collisions: event.target.checked })} />Actor–object collisions</label>
    {status === 'loading' && <p role="status">Loading saved motion…</p>}
    {status === 'error' && <p role="alert" className="scene-error">{error}</p>}
    <span className="scene-muted">Motion playback uses local files.</span>
  </>
}

function MotionTransport() {
  const { status, playing, frame, fps, frameCount } = useMotionStore()
  const duration = frameCount / fps
  return <div className="scene-transport">
    <div><span className="scene-eyebrow">PERFORMANCE</span><strong>Fight & fall</strong></div>
    <button aria-label={playing ? 'Pause motion' : 'Play motion'} disabled={status !== 'ready'} onClick={() => useMotionStore.setState({ playing: !playing })}>{playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}</button>
    <button aria-label="Restart motion" disabled={status !== 'ready'} onClick={() => seekMotion(0)}><ArrowCounterClockwiseIcon size={16} /></button>
    <input aria-label="Motion playback" type="range" min={0} max={Math.max(0, frameCount - 1)} step={1} value={frame} disabled={status !== 'ready'} onChange={(event) => { useMotionStore.setState({ playing: false }); seekMotion(Number(event.target.value)) }} />
    <span className="scene-time">{(frame / fps).toFixed(1)} / {duration.toFixed(1)} s</span>
  </div>
}
