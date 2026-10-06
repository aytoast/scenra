import { Component, Suspense, useRef, useEffect, useState, useCallback, type ReactNode } from 'react'
import { Tooltip } from '@radix-ui/themes'
import { ArrowsClockwiseIcon, CaretDownIcon, CaretUpIcon } from '@phosphor-icons/react'
import { Canvas, useThree } from '@react-three/fiber'
import { XRScene } from '../modules/xr/XRScene'
import { useXRStore } from '../modules/xr/store'
import { PerspectiveCamera } from 'three'
import { Physics } from '@react-three/rapier'
import { SplatRenderer } from '../modules/splat/SplatRenderer'
import { EnvironmentMap } from '../modules/environment/EnvironmentMap'
import { WorldCollider } from '../modules/collider/WorldCollider'
import { GroundPlane } from '../modules/collider/GroundPlane'
import { FlyController, type FlyControllerHandle } from '../modules/character/FlyController'
import { ObjectGrid } from '../modules/scene/ObjectGrid'
import { PlacementEditorScene, usePlacementEditor } from '../modules/scene/PlacementEditor'
import { OriginHelper } from '../modules/scene/OriginHelper'
import { PostProcessing } from '../modules/postprocessing/PostProcessing'
import { DEFAULT_SHADOW_CATCHER_COLOR, DEFAULT_SHADOW_CATCHER_OPACITY, shadowCatcherColor, shadowCatcherOpacity } from '../modules/scene/shadows'
import { getSplatUrl, localWorldAssetUrl } from '../utils/worldLoader'
import { assetUrl } from '../utils/assetUrl'
import { useDebugStore } from '../store/debug'
import { WorldRenderMode, ObjectRenderMode, ViewerQuality, type Vec3Tuple, type World, type WorldHoverPreview, type WorldObjectAsset, type WorldSceneProject, type WorldMotion } from '../types/world'
import { AppButton } from './AppButton'
import { chrome } from './AppChrome'
import type { PlayerSpawn } from '../modules/character/spawn'
import { StageonMotion } from '../modules/motion/StageonMotion'
import { ShowcaseCamera } from './ShowcaseCamera'
import { ActorPaths } from '../modules/motion/ActorPaths'
import { useMotionStore } from '../modules/motion/store'
import { useSceneEditorStore } from '../modules/scene/editorStore'
import { SceneEditor } from './SceneEditor'

function Perspective({ fieldOfView }: { fieldOfView: number }) {
  const camera = useThree((state) => state.camera)
  useEffect(() => {
    if (camera instanceof PerspectiveCamera) {
      camera.fov = fieldOfView
      camera.updateProjectionMatrix()
    }
  }, [camera, fieldOfView])
  return null
}

type CharHandle = FlyControllerHandle
const DEFAULT_ENVIRONMENT_URL = assetUrl('/hdri.jpg')
const DEFAULT_WORLD_SEMANTICS = {
  metric_scale_factor: 1,
  ground_plane_offset: 0,
  flip_y: true,
}

function sunPositionFromRotation(rotation: Vec3Tuple): Vec3Tuple {
  let x = 0
  let y = 10
  let z = 0
  const [rx, ry, rz] = rotation
  const cx = Math.cos(rx)
  const sx = Math.sin(rx)
  const cy = Math.cos(ry)
  const sy = Math.sin(ry)
  const cz = Math.cos(rz)
  const sz = Math.sin(rz)

  ;[y, z] = [y * cx - z * sx, y * sx + z * cx]
  ;[x, z] = [x * cy + z * sy, -x * sy + z * cy]
  ;[x, y] = [x * cz - y * sz, x * sz + y * cz]

  return [x, y, z]
}

interface OptionalAssetBoundaryProps {
  label: string
  resetKey: string
  fallback?: ReactNode
  children: ReactNode
}

interface OptionalAssetBoundaryState {
  hasError: boolean
}

class OptionalAssetBoundary extends Component<OptionalAssetBoundaryProps, OptionalAssetBoundaryState> {
  state: OptionalAssetBoundaryState = { hasError: false }

  static getDerivedStateFromError(): OptionalAssetBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.warn(`Skipping optional world asset "${this.props.label}" because it failed to load.`, error)
  }

  componentDidUpdate(prevProps: OptionalAssetBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false })
    }
  }

  render() {
    if (this.state.hasError) return this.props.fallback ?? null
    return this.props.children
  }
}

function GrayEnvironmentFallback() {
  return (
    <>
      <color attach="background" args={['#6b7280']} />
      <ambientLight color="#ffffff" intensity={0.9} />
    </>
  )
}

function DefaultEnvironment({ intensity }: { intensity: number }) {
  return (
    <OptionalAssetBoundary label={DEFAULT_ENVIRONMENT_URL} resetKey={DEFAULT_ENVIRONMENT_URL} fallback={<GrayEnvironmentFallback />}>
      <Suspense fallback={null}>
        <EnvironmentMap panoUrl={DEFAULT_ENVIRONMENT_URL} intensity={intensity} />
      </Suspense>
    </OptionalAssetBoundary>
  )
}

interface Props {
  world?: World
  slug: string
  playerSpawn?: PlayerSpawn
  motion?: WorldMotion
  sourceImageUrl?: string
  hoveredWorldPreview?: WorldHoverPreview | null
  objectAssets: WorldObjectAsset[]
  allObjectAssets: WorldObjectAsset[]
  sceneProject?: WorldSceneProject
  sceneProjectReady?: boolean
  hoveredObjectAssetId?: string | null
  hoveredObjectInstanceId?: string | null
  editing?: boolean
  onEditorSaveReady?: (save: (() => Promise<boolean>) | null) => void
  uiVisible?: boolean
  onObjectHover?: (asset: WorldObjectAsset, hovering: boolean, instanceId?: string) => void
  onSceneProjectSaved?: (project: WorldSceneProject) => void
  onRefreshWorlds?: () => void
  refreshingWorlds?: boolean
}

export function WorldViewer({
  world: desiredWorld,
  slug: desiredSlug,
  playerSpawn,
  motion,
  sourceImageUrl,
  hoveredWorldPreview,
  objectAssets: desiredObjectAssets,
  allObjectAssets,
  sceneProject,
  sceneProjectReady = true,
  hoveredObjectAssetId,
  hoveredObjectInstanceId,
  editing = false,
  onEditorSaveReady,
  uiVisible = true,
  onObjectHover,
  onSceneProjectSaved,
  onRefreshWorlds,
  refreshingWorlds = false,
}: Props) {
  const selection = useSceneEditorStore(state => state.selection)
  const settingsOpen = useSceneEditorStore(state => state.settingsOpen)
  const pathPick = useMotionStore(state => state.pathPick)
  const charRef = useRef<CharHandle>(null)
  const worldRenderMode = useDebugStore((s) => s.worldRenderMode)
  const objectRenderMode = useDebugStore((s) => s.objectRenderMode)
  const viewerQuality = useDebugStore((s) => s.viewerQuality)
  const controllerResetToken = useDebugStore((s) => s.controllerResetToken)
  const environmentIntensity = useDebugStore((s) => s.environmentIntensity)
  const sunIntensity = useDebugStore((s) => s.sunIntensity)
  const sunColor = useDebugStore((s) => s.sunColor)
  const [sourceThumbnailCollapsed, setSourceThumbnailCollapsed] = useState(true)
  const fieldOfView = useDebugStore((state) => state.fieldOfView)
  const setFieldOfView = useDebugStore((state) => state.setFieldOfView)
  const handleZoom = useCallback((delta: number) => {
    const state = useDebugStore.getState()
    state.setFieldOfView(state.fieldOfView + delta * 0.05)
  }, [])
  const colliderUrl = localWorldAssetUrl(desiredWorld?.assets.mesh.collider_mesh_url)
  const panoUrl = localWorldAssetUrl(desiredWorld?.assets.imagery.pano_url)

  useEffect(() => {
    charRef.current?.reset()
    setFieldOfView(75)
  }, [desiredSlug, setFieldOfView])

  useEffect(() => {
    if (controllerResetToken > 0) charRef.current?.reset()
  }, [controllerResetToken])

  const xrActive = useXRStore((state) => state.active)
  const embedded = new URLSearchParams(location.search).get('embed') === '1'
  const showcase = new URLSearchParams(location.search).get('showcase')
  const splatUrl = desiredWorld ? showcase && !xrActive
    ? localWorldAssetUrl(desiredWorld.assets.splats.spz_urls['500k']) || getSplatUrl(desiredWorld, true)
    : getSplatUrl(desiredWorld, xrActive || embedded) : ''
  const { ground_plane_offset, flip_y, metric_scale_factor } = desiredWorld?.assets.splats.semantics_metadata ?? DEFAULT_WORLD_SEMANTICS
  const flipY = flip_y ?? true
  const baseMetricScaleFactor = metric_scale_factor ?? 1
  const baseGroundPlaneOffset = ground_plane_offset ?? 0
  const isHighQuality = viewerQuality === ViewerQuality.High && !xrActive && !embedded
  const showScene = worldRenderMode !== WorldRenderMode.ObjectOnly
  const showSplat = showScene && objectRenderMode === ObjectRenderMode.Lit
  const showObjects = worldRenderMode !== WorldRenderMode.SplatOnly
  const placementEditor = usePlacementEditor({
    slug: desiredSlug,
    objects: desiredObjectAssets,
    allObjectAssets,
    sceneProject,
    baseMetricScaleFactor,
    baseGroundPlaneOffset,
    sceneProjectReady,
    editing,
    hotkeysEnabled: selection?.kind === 'object' && !settingsOpen,
    hoveredObjectAssetId,
    hoveredObjectInstanceId,
    onObjectHover,
    onProjectSaved: onSceneProjectSaved,
  })
  useEffect(() => {
    if (selection?.kind !== 'object') placementEditor.setSelectedId(null)
  }, [selection?.kind, placementEditor.setSelectedId])
  useEffect(() => {
    if (selection?.kind === 'object' && (placementEditor.selectedId !== selection.instanceId || !placementEditor.instances.some(instance => instance.instanceId === selection.instanceId))) {
      useSceneEditorStore.setState({ selection: null })
    }
  }, [selection, placementEditor.selectedId, placementEditor.instances])
  useEffect(() => {
    onEditorSaveReady?.(placementEditor.saveProject)
    return () => onEditorSaveReady?.(null)
  }, [onEditorSaveReady, placementEditor.saveProject])
  const activeSceneSun = editing ? placementEditor.sun : sceneProject?.sun
  const activeSunIntensity = activeSceneSun?.intensity ?? sunIntensity
  const activeEnvironmentIntensity = activeSceneSun?.environmentIntensity ?? environmentIntensity
  const activeSunPosition = sunPositionFromRotation(activeSceneSun?.rotation ?? [0, 0, 0])
  const activeMetricScaleFactor = editing ? placementEditor.metricScaleFactor : sceneProject?.metricScaleFactor ?? baseMetricScaleFactor
  const defaultGroundPlaneOffset = baseGroundPlaneOffset * (activeMetricScaleFactor / baseMetricScaleFactor)
  const activeGroundPlaneOffset = editing
    ? placementEditor.groundPlaneOffset
    : sceneProject?.groundPlaneOffset ?? defaultGroundPlaneOffset
  const sceneGroundPlaneColliderEnabled = editing
    ? placementEditor.groundPlaneColliderEnabled
    : sceneProject?.groundPlaneColliderEnabled ?? true
  const activeGroundPlaneColliderEnabled = worldRenderMode === WorldRenderMode.ObjectOnly
    ? true
    : sceneGroundPlaneColliderEnabled
  const sceneShadowCatcherOpacity = editing ? placementEditor.shadowCatcherOpacity : sceneProject?.shadowCatcherOpacity
  const activeShadowCatcherOpacity = shadowCatcherOpacity(sceneShadowCatcherOpacity ?? DEFAULT_SHADOW_CATCHER_OPACITY)
  const sceneShadowCatcherColor = editing ? placementEditor.shadowCatcherColor : sceneProject?.shadowCatcherColor
  const activeShadowCatcherColor = shadowCatcherColor(sceneShadowCatcherColor ?? DEFAULT_SHADOW_CATCHER_COLOR)
  const objectPlacements = sceneProject?.instances ?? placementEditor.instances
  const objectPhysicsAssets = sceneProject?.instances.length ? allObjectAssets : desiredObjectAssets
  const hoveredObjectAsset = hoveredObjectAssetId
    ? allObjectAssets.find((asset) => asset.assetId === hoveredObjectAssetId)
      ?? desiredObjectAssets.find((asset) => asset.assetId === hoveredObjectAssetId)
    : undefined
  const activePreviewImageUrl = hoveredObjectAsset?.referenceImageUrl
    ?? hoveredObjectAsset?.thumbnailUrl
    ?? hoveredWorldPreview?.imageUrl
    ?? sourceImageUrl
  const activePreviewAlt = hoveredObjectAsset
    ? `${hoveredObjectAsset.name} reference image`
    : hoveredWorldPreview?.imageUrl
      ? hoveredWorldPreview.alt
      : 'Original source'
  return (
    <>
      <Canvas
        dpr={embedded ? 1 : [1, 2]}
        camera={{ fov: 75, near: 0.1, far: 1000 }}
        className="w-full h-full"
        gl={{ antialias: false }}
        shadows={isHighQuality}
        onCreated={(state) => {
          const compute = state.events.compute
          state.setEvents({ compute: (event, current, previous) => {
            if (document.pointerLockElement === current.gl.domElement) {
              current.pointer.set(0, 0)
              current.raycaster.setFromCamera(current.pointer, current.camera)
            } else compute?.(event, current, previous)
          } })
        }}
      >
        <Perspective fieldOfView={fieldOfView} />
        <XRScene enabled={!editing} />
        <Suspense fallback={null}>
          <Physics key={`${desiredSlug}:${controllerResetToken}`} gravity={[0, -9.81, 0]}>
            {showcase ? <ShowcaseCamera mode={showcase} /> : <FlyController ref={charRef} spawn={playerSpawn} onZoom={handleZoom} />}
            {showScene && colliderUrl && (
              <OptionalAssetBoundary label={colliderUrl} resetKey={colliderUrl}>
                <Suspense fallback={null}>
                  <WorldCollider
                    url={colliderUrl}
                    flipY={flipY}
                    groundPlaneOffset={activeGroundPlaneOffset}
                    metricScaleFactor={activeMetricScaleFactor}
                    shadowOpacity={activeShadowCatcherOpacity}
                    shadowColor={activeShadowCatcherColor}
                  />
                </Suspense>
              </OptionalAssetBoundary>
            )}
            {showObjects && !editing && (
              <Suspense fallback={null}>
                <ObjectGrid
                  objects={objectPhysicsAssets}
                  placements={objectPlacements}
                />
              </Suspense>
            )}
            {showObjects && editing && (
              <Suspense fallback={null}>
                <PlacementEditorScene controller={placementEditor} renderMode={objectRenderMode} interactive={!pathPick && !settingsOpen} />
              </Suspense>
            )}
            <GroundPlane
              groundColliderEnabled={activeGroundPlaneColliderEnabled}
            />
            {motion && showcase !== 'props' && <StageonMotion config={motion} slug={desiredSlug} physics={showObjects} autoPlay={!editing} editable={editing && uiVisible && !settingsOpen && !showcase} />}
            {motion && uiVisible && !showcase && editing && selection?.kind === 'actor' && !settingsOpen && !xrActive && <ActorPaths position={motion.position} />}
          </Physics>
          {splatUrl && (
            <OptionalAssetBoundary label={splatUrl} resetKey={splatUrl}>
              <SplatRenderer
                url={splatUrl}
                visible={showSplat && showcase !== 'props'}
                useViewerEffects={!embedded}
                onReady={() => { if (window.parent !== window) window.parent.postMessage({ type: 'scenra-render-ready' }, document.referrer ? new URL(document.referrer).origin : location.origin) }}
                groundPlaneOffset={activeGroundPlaneOffset}
                flipY={flipY}
                metricScaleFactor={activeMetricScaleFactor}
              />
            </OptionalAssetBoundary>
          )}
          <directionalLight
            castShadow={isHighQuality && activeSunIntensity > 0}
            color={sunColor}
            intensity={activeSunIntensity}
            position={activeSunPosition}
            shadow-mapSize={[2048, 2048]}
            shadow-bias={-0.0001}
            shadow-normalBias={0.02}
            shadow-camera-near={0.5}
            shadow-camera-far={30}
            shadow-camera-left={-20}
            shadow-camera-right={20}
            shadow-camera-top={20}
            shadow-camera-bottom={-20}
          />
          {panoUrl && !embedded && (
            <OptionalAssetBoundary label={panoUrl} resetKey={panoUrl} fallback={<DefaultEnvironment intensity={activeEnvironmentIntensity} />}>
              <Suspense fallback={null}>
                <EnvironmentMap panoUrl={panoUrl} intensity={activeEnvironmentIntensity} />
              </Suspense>
            </OptionalAssetBoundary>
          )}
          {(!panoUrl || embedded) && <DefaultEnvironment intensity={activeEnvironmentIntensity} />}
          <OriginHelper />
          {isHighQuality && <PostProcessing />}
        </Suspense>
      </Canvas>
      {uiVisible && (
        <SourceImageControls
          activeSourceImageUrl={activePreviewImageUrl}
          previewAlt={activePreviewAlt}
          thumbnailCollapsed={sourceThumbnailCollapsed}
          refreshingWorlds={refreshingWorlds}
          onRefreshWorlds={onRefreshWorlds}
          onThumbnailCollapseToggle={() => setSourceThumbnailCollapsed((collapsed) => !collapsed)}
        />
      )}
      {editing && uiVisible && !showcase && <SceneEditor controller={placementEditor} />}
    </>
  )
}

function SourceImageControls({
  activeSourceImageUrl,
  previewAlt,
  thumbnailCollapsed,
  refreshingWorlds,
  onRefreshWorlds,
  onThumbnailCollapseToggle,
}: {
  activeSourceImageUrl?: string
  previewAlt: string
  thumbnailCollapsed: boolean
  refreshingWorlds: boolean
  onRefreshWorlds?: () => void
  onThumbnailCollapseToggle: () => void
}) {
  if (!activeSourceImageUrl && !import.meta.env.DEV) return null

  return (
    <div className={`scene-source-preview pointer-events-none absolute bottom-2 right-2 z-30 hidden md:block ${chrome.enter}`}>
      {activeSourceImageUrl ? (
        thumbnailCollapsed ? (
          <div className="flex items-center gap-1">
            {import.meta.env.DEV && onRefreshWorlds && (
              <RefreshWorldsButton
                refreshing={refreshingWorlds}
                onRefresh={onRefreshWorlds}
                className="pointer-events-auto"
              />
            )}
            <SourceThumbnailCollapseButton
              collapsed={thumbnailCollapsed}
              onToggle={onThumbnailCollapseToggle}
              className="pointer-events-auto"
            />
          </div>
        ) : (
          <div className="chrome-glass relative overflow-hidden rounded-lg border border-white/15 shadow-lg">
            <img
              src={activeSourceImageUrl}
              alt={previewAlt}
              className="block h-96 aspect-square object-cover"
              draggable={false}
            />
            <div className="absolute bottom-0.5 right-0.5 flex items-center gap-1">
              {import.meta.env.DEV && onRefreshWorlds && (
                <RefreshWorldsButton
                  refreshing={refreshingWorlds}
                  onRefresh={onRefreshWorlds}
                  className="pointer-events-auto"
                />
              )}
              <SourceThumbnailCollapseButton
                collapsed={thumbnailCollapsed}
                onToggle={onThumbnailCollapseToggle}
                className="pointer-events-auto"
              />
            </div>
          </div>
        )
      ) : (
        import.meta.env.DEV && onRefreshWorlds && (
          <RefreshWorldsButton
            refreshing={refreshingWorlds}
            onRefresh={onRefreshWorlds}
            className="pointer-events-auto"
          />
        )
      )}
    </div>
  )
}

function SourceThumbnailCollapseButton({
  collapsed,
  onToggle,
  className = '',
}: {
  collapsed: boolean
  onToggle: () => void
  className?: string
}) {
  const Icon = collapsed ? CaretUpIcon : CaretDownIcon

  return (
    <Tooltip
      content={collapsed ? 'show original source image' : 'collapse original source image'}
      delayDuration={0}
      side="top"
    >
      <AppButton
        onClick={onToggle}
        className={`chrome-glass h-6 w-6 justify-center rounded border border-white/15 p-0 text-white opacity-70 shadow-lg ${className}`}
        aria-label={collapsed ? 'Show original source image' : 'Collapse original source image'}
        aria-pressed={collapsed}
      >
        <Icon size={15} weight="bold" />
      </AppButton>
    </Tooltip>
  )
}

function RefreshWorldsButton({
  refreshing,
  onRefresh,
  className = '',
}: {
  refreshing: boolean
  onRefresh: () => void
  className?: string
}) {
  return (
    <Tooltip
      content={refreshing ? 'refreshing local assets' : 'refresh local assets'}
      delayDuration={0}
      side="top"
    >
      <AppButton
        onClick={onRefresh}
        active={refreshing}
        className={`chrome-glass h-6 w-6 justify-center rounded border border-white/15 p-0 text-white shadow-lg ${className}`}
        aria-label="Refresh local assets"
      >
        <ArrowsClockwiseIcon size={12} weight={refreshing ? 'bold' : 'regular'} />
      </AppButton>
    </Tooltip>
  )
}
