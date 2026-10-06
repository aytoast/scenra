import { useEffect, useRef, useState } from 'react'
import { ArrowUUpLeft, ArrowUUpRight, ArrowsOutCardinal, ArrowClockwise, CornersOut, ArrowDown, Copy, Trash, Cube, Person, GearSix, Plus, CaretDown, CaretUp } from '@phosphor-icons/react'
import { chrome, ChromeThumbnail } from './AppChrome'
import { ActorInspector } from './ActorInspector'
import { ViewSettings, MotionSettings } from './SceneWorkspace'
import { NumberValueInput, TransformValueInput, type ObjectWorldTransform, type PlacementEditorController, type TransformMode } from '../modules/scene/PlacementEditor'
import { useMotionStore } from '../modules/motion/store'
import { selectActor, useSceneEditorStore } from '../modules/scene/editorStore'
import type { WorldObjectPhysics } from '../types/world'
import './scene-editor.css'

const axes = ['X', 'Y', 'Z'] as const
const tools: { mode: TransformMode; name: string; icon: typeof ArrowsOutCardinal; help: string }[] = [
  { mode: 'translate', name: 'Move', icon: ArrowsOutCardinal, help: 'Drag colored arrows to change position. X, Y and Z set world coordinates.' },
  { mode: 'rotate', name: 'Rotate', icon: ArrowClockwise, help: 'Drag colored rings to turn object. Rotation fields use degrees.' },
  { mode: 'scale', name: 'Resize', icon: CornersOut, help: 'Drag colored handles to change size. Scale fields multiply original dimensions.' },
]

export function SceneEditor({ controller }: { controller: PlacementEditorController }) {
  const { selection, settingsOpen } = useSceneEditorStore()
  const timeline = useMotionStore(state => state.timeline)
  const motionStatus = useMotionStore(state => state.status)
  const motionError = useMotionStore(state => state.error)
  const [assetsOpen, setAssetsOpen] = useState(false)
  const assetFor = (instance: PlacementEditorController['instances'][number]) => controller.assetsById.get(instance.assetId ?? instance.objectId) ?? controller.assetsById.get(instance.objectId)
  const selectedInstance = selection?.kind === 'object' ? controller.selectedInstance : undefined
  const selectedAsset = selectedInstance && assetFor(selectedInstance)
  return <div className="scene-editor-overlay">
    <aside className={`scene-outliner ${chrome.panel}`} aria-label="Scene Graph">
      <div className="editor-panel-heading"><h2>Scene Graph</h2><div className="editor-icon-actions">
        <button aria-label="Undo object edit" title="Undo object edit" disabled={!controller.canUndo} onClick={controller.undo}><ArrowUUpLeft size={16} /></button>
        <button aria-label="Redo object edit" title="Redo object edit" disabled={!controller.canRedo} onClick={controller.redo}><ArrowUUpRight size={16} /></button>
      </div></div>
      <div className="scene-graph-content">
        <p className="editor-group-label">Actors</p>
        {timeline?.actors.map(actor => <button key={actor.actor} className="scene-graph-item" aria-pressed={selection?.kind === 'actor' && selection.actor === actor.actor} onClick={() => selectActor(actor.actor)} onMouseEnter={() => useSceneEditorStore.setState({ hoveredActor: actor.actor })} onMouseLeave={() => useSceneEditorStore.setState({ hoveredActor: null })}><Person size={16} /><span>{actor.name}</span><small>{actor.clips.length} {actor.clips.length === 1 ? 'action' : 'actions'}</small></button>)}
        {motionStatus === 'loading' && <p className="scene-muted editor-empty" role="status">Loading performers…</p>}
        {motionStatus === 'error' && <p className="scene-error editor-empty" role="alert">{motionError}</p>}
        <p className="editor-group-label">Props</p>
        {controller.instances.map(instance => {
          const asset = assetFor(instance)
          return <button key={instance.instanceId} className="scene-graph-item" aria-pressed={selection?.kind === 'object' && selection.instanceId === instance.instanceId} onClick={() => controller.selectFromOverlay(instance.instanceId)} onMouseEnter={() => asset && controller.hoverAsset(asset, true, instance.instanceId)} onMouseLeave={() => asset && controller.hoverAsset(asset, false, instance.instanceId)}><Cube size={16} /><span>{asset?.name ?? instance.objectId}</span></button>
        })}
        {!controller.instances.length && <p className="scene-muted editor-empty">Add props from Assets.</p>}
      </div>
      <button className="scene-assets-toggle" aria-expanded={assetsOpen} onClick={() => setAssetsOpen(open => !open)}><Plus size={15} />Add from Assets{assetsOpen ? <CaretUp size={14} /> : <CaretDown size={14} />}</button>
      {assetsOpen && <div className="scene-asset-picker"><div className="editor-segmented"><button aria-pressed={controller.assetFilter === 'world'} onClick={() => controller.setAssetFilter('world')}>This scene</button><button aria-pressed={controller.assetFilter === 'all'} onClick={() => controller.setAssetFilter('all')}>All assets</button></div>
        {controller.visibleAssetLibrary.map(asset => <button key={asset.assetId} className="scene-graph-item" title={`Add ${asset.name} to scene`} onClick={() => controller.addAsset(asset)} onMouseEnter={() => controller.hoverAsset(asset, true)} onMouseLeave={() => controller.hoverAsset(asset, false)}><ChromeThumbnail thumbnailUrl={asset.thumbnailUrl} alt="" /><span>{asset.name}</span><Plus size={14} /></button>)}
        {!controller.visibleAssetLibrary.length && <p className="editor-empty scene-muted">No assets available.</p>}
      </div>}
    </aside>
    <aside className={`scene-inspector scene-editor-inspector ${chrome.panel}`} aria-label={settingsOpen ? 'Scene settings' : selection?.kind === 'actor' ? 'Actor inspector' : 'Object inspector'}>
      {settingsOpen ? <><div className="editor-panel-heading"><h2><GearSix size={16} />Settings</h2><button onClick={() => useSceneEditorStore.setState({ settingsOpen: false })}>Done</button></div><div className="scene-inspector-content"><ViewSettings /><div className="editor-module"><MotionSettings available={Boolean(timeline) || motionStatus === 'loading' || motionStatus === 'error'} /></div><EnvironmentSettings controller={controller} /></div></>
      : selection?.kind === 'actor' ? <ActorInspector actor={selection.actor} onSelectActor={selectActor} />
      : selectedInstance ? <><div className="editor-panel-heading"><h2><Cube size={16} />{selectedAsset?.name ?? selectedInstance.objectId}</h2></div><div className="scene-inspector-content">
        <div className="editor-module"><h2>Placement</h2><div className="editor-segmented editor-transform-tools">{tools.map(tool => <button key={tool.mode} aria-pressed={controller.mode === tool.mode} onClick={() => controller.setMode(tool.mode)}><tool.icon size={15} />{tool.name}</button>)}</div><p className="scene-muted">{tools.find(tool => tool.mode === controller.mode)?.help}</p>
          <ObjectTransformFields key={selectedInstance.instanceId} controller={controller} instance={selectedInstance} />
          <button className="editor-floor-button" onClick={controller.dropSelectedToFloor}><ArrowDown size={15} />Place on floor</button><p className="scene-muted">Move object down to nearest surface, keeping rotation and size.</p>
        </div>
        <div className="editor-module"><h2>Physics</h2><label className="scene-field">Body type<select aria-label="Object body type" value={selectedInstance.physics ?? 'rigidbody'} onChange={event => controller.updateSelectedPhysics(event.target.value as WorldObjectPhysics)}><option value="rigidbody">Rigidbody</option><option value="static">Static</option><option value="ghost">Ghost</option></select></label><p className="scene-muted">Rigidbody moves with gravity and contact. Static blocks movement. Ghost has no collisions.</p></div>
        <div className="editor-button-row"><button onClick={controller.duplicateSelected}><Copy size={15} />Duplicate</button><button onClick={controller.deleteSelected}><Trash size={15} />Delete</button></div>
      </div></> : <div className="scene-inspector-content"><p className="scene-muted">Select actor or prop in Scene Graph.</p></div>}
    </aside>
    {controller.saveStatus === 'error' && <p className={`scene-save-error ${chrome.panel}`} role="alert">Scene could not be saved. Changes remain in editor; retry Save & Preview.</p>}
  </div>
}

function sameTransform(left: ObjectWorldTransform, right: ObjectWorldTransform) {
  return (['position', 'rotation', 'scale'] as const).every(field => left[field].every((value, axis) => value === right[field][axis]))
}

function ObjectTransformFields({ controller, instance }: { controller: PlacementEditorController; instance: PlacementEditorController['instances'][number] }) {
  const [transform, setTransform] = useState<ObjectWorldTransform>(() => controller.readSelectedWorldTransform() ?? instance)
  const fallbackRef = useRef(instance)
  fallbackRef.current = instance
  const readTransform = controller.readSelectedWorldTransform
  useEffect(() => {
    const refresh = () => {
      const next = readTransform() ?? fallbackRef.current
      setTransform(current => sameTransform(current, next) ? current : next)
    }
    refresh()
    const timer = window.setInterval(refresh, 100)
    return () => window.clearInterval(timer)
  }, [readTransform])
  return <>
    <div className="editor-transform-head"><span /><span>X</span><span>Y</span><span>Z</span></div>
    {(['position', 'rotation', 'scale'] as const).map(field => <div key={field} className="editor-transform-row"><span>{field === 'position' ? 'Position' : field === 'rotation' ? 'Rotation °' : 'Scale'}</span>{axes.map((axis, index) => <label key={axis}><span className="sr-only">{field} {axis}</span><TransformValueInput field={field} axis={index as 0 | 1 | 2} step={field === 'rotation' ? 5 : .01} value={transform[field][index]} onChange={controller.updateSelectedTransform} /></label>)}</div>)}
  </>
}

function EnvironmentSettings({ controller }: { controller: PlacementEditorController }) {
  return <div className="editor-module"><h2>Environment</h2>
    <label className="scene-field">Sun intensity<NumberValueInput value={controller.sun.intensity} step={.1} onChange={controller.updateSunIntensity} /></label>
    <div className="editor-transform-head"><span>Sun angle °</span>{axes.map(axis => <span key={axis}>{axis}</span>)}</div><div className="editor-transform-row"><span /><span className="editor-sun-axes">{axes.map((axis, index) => <label key={axis}><span className="sr-only">Sun rotation {axis}</span><NumberValueInput value={controller.sun.rotation[index]} displayValue={controller.sun.rotation[index] * 180 / Math.PI} step={1} toStoredValue={value => value * Math.PI / 180} onChange={value => controller.updateSunRotation(index as 0 | 1 | 2, value)} /></label>)}</span></div>
    <label className="scene-field">Environment intensity<NumberValueInput value={controller.sun.environmentIntensity ?? 2} step={.1} onChange={controller.updateEnvironmentIntensity} /></label>
    <label className="scene-field">World scale<NumberValueInput value={controller.metricScaleFactor} step={.01} onChange={controller.updateMetricScaleFactor} /><button onClick={controller.resetMetricScaleFactor}>Reset world scale</button></label>
    <label className="scene-field">Ground height<NumberValueInput value={controller.groundPlaneOffset} step={.01} onChange={controller.updateGroundPlaneOffset} /><button onClick={controller.resetGroundPlaneOffset}>Reset ground height</button></label>
    <label className="scene-check"><input type="checkbox" checked={controller.groundPlaneColliderEnabled} onChange={event => controller.updateGroundPlaneColliderEnabled(event.target.checked)} />Flat floor collisions</label>
    <label className="scene-field">Shadow opacity<NumberValueInput value={controller.shadowCatcherOpacity} step={.05} onChange={controller.updateShadowCatcherOpacity} /></label>
    <label className="scene-field">Shadow color<input aria-label="Shadow color" type="color" value={controller.shadowCatcherColor} onChange={event => controller.updateShadowCatcherColor(event.target.value)} /></label>
  </div>
}
