import { useCallback, useEffect, useRef, useState } from 'react'
import { useRoute, useLocation, Redirect } from 'wouter'
import { WorldViewer } from './components/WorldViewer'
import { SceneWorkspace } from './components/SceneWorkspace'
import { CreateScene } from './components/CreateScene'
import { useSceneProject } from './modules/scene/useSceneProject'
import { fetchWorlds, loadWorlds } from './utils/worldLoader'
import { isEditableTarget } from './utils/dom'
import type { WorldEntry, WorldHoverPreview, WorldObjectAsset } from './types/world'

export function App() {
  const [location] = useLocation()
  const [worlds, setWorlds] = useState(loadWorlds)
  const [refreshingWorlds, setRefreshingWorlds] = useState(false)
  const refreshTimeoutRef = useRef<number | undefined>(undefined)

  const refreshWorlds = useCallback(async () => {
    if (!import.meta.env.DEV) return
    setRefreshingWorlds(true)
    try {
      setWorlds(await fetchWorlds())
    } catch (error) {
      console.warn('Could not refresh local world assets.', error)
    } finally {
      setRefreshingWorlds(false)
    }
  }, [])

  useEffect(() => {
    refreshWorlds()
  }, [refreshWorlds])

  useEffect(() => {
    if (!import.meta.env.DEV) return

    const refreshSoon = () => {
      window.clearTimeout(refreshTimeoutRef.current)
      refreshTimeoutRef.current = window.setTimeout(() => {
        void refreshWorlds()
      }, 150)
    }

    import.meta.hot?.on('worlds-changed', refreshSoon)
    return () => {
      window.clearTimeout(refreshTimeoutRef.current)
      import.meta.hot?.off('worlds-changed', refreshSoon)
    }
  }, [refreshWorlds])

  if (location === '/create') return <CreateScene refresh={refreshWorlds} />
  if (!worlds.length) {
    return <Redirect to="/create" />
  }

  return (
    <LoadedApp
      worlds={worlds}
      refreshingWorlds={refreshingWorlds}
      onRefreshWorlds={refreshWorlds}
    />
  )
}

function LoadedApp({
  worlds,
  refreshingWorlds,
  onRefreshWorlds,
}: {
  worlds: WorldEntry[]
  refreshingWorlds: boolean
  onRefreshWorlds: () => Promise<void>
}) {
  const [editMatch, editParams] = useRoute('/:slug/edit')
  const [match, params] = useRoute('/:slug')
  const saveEditor = useRef<(() => Promise<boolean>) | null>(null)
  const [, navigate] = useLocation()
  const [uiHidden, setUiHidden] = useState(false)
  const [sceneProjectEnabled, setSceneProjectEnabled] = useState(true)
  const [selectedWorldVersions, setSelectedWorldVersions] = useState<Record<string, number>>({})
  const [hoveredObjectAssetId, setHoveredObjectAssetId] = useState<string | null>(null)
  const [hoveredObjectInstanceId, setHoveredObjectInstanceId] = useState<string | null>(null)
  const [hoveredWorldPreview, setHoveredWorldPreview] = useState<WorldHoverPreview | null>(null)

  const slug = editParams?.slug ?? params?.slug ?? worlds[0].slug
  const entry = worlds.find((w) => w.slug === slug) ?? worlds[0]
  const editing = Boolean(editMatch)
  const uiVisible = !uiHidden
  const defaultWorldVersionIndex = entry.worldVersions[entry.worldVersions.length - 1]?.index
  const activeWorldVersionIndex = selectedWorldVersions[entry.slug] ?? defaultWorldVersionIndex
  const activeWorldVersion = entry.worldVersions.find((version) => version.index === activeWorldVersionIndex)
  const activeWorld = activeWorldVersion?.world ?? entry.world
  const renderableObjectAssets = entry.objectAssets.filter((asset) => asset.complete && asset.url)
  const renderableAllObjectAssets = entry.allObjectAssets.filter((asset) => asset.complete && asset.url)
  const { sceneProject, sceneProjectReady, updateSceneProject } = useSceneProject(entry.slug, entry.slug, entry.sceneProject)
  const sceneProjectActive = Boolean(sceneProject && sceneProjectEnabled)

  useEffect(() => {
    setSceneProjectEnabled(true)
    setHoveredObjectAssetId(null)
    setHoveredObjectInstanceId(null)
    setHoveredWorldPreview(null)
  }, [entry.slug])

  const handleObjectHover = useCallback((asset: WorldObjectAsset, hovering: boolean, instanceId?: string) => {
    setHoveredObjectAssetId((current) => {
      if (hovering) return asset.assetId
      return current === asset.assetId ? null : current
    })
    setHoveredObjectInstanceId((current) => {
      if (hovering) return instanceId ?? null
      return current === instanceId ? null : current
    })
  }, [])

  const handleWorldHover = useCallback((preview: WorldHoverPreview, hovering: boolean) => {
    setHoveredWorldPreview((current) => {
      if (hovering) return preview
      return current?.slug === preview.slug ? null : current
    })
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return
      if (event.code !== 'Backquote') return
      event.preventDefault()
      setUiHidden((hidden) => !hidden)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (!editMatch && !match) {
    const home = worlds.find((world) => world.slug === 'temple-courtyard') ?? worlds[0]
    return <Redirect to={`/${home.slug}`} />
  }

  const viewer = <WorldViewer
    world={activeWorld}
    slug={entry.slug}
    playerSpawn={entry.project.player_spawn}
    motion={entry.project.motion}
    sourceImageUrl={entry.sourceImageUrl}
    hoveredWorldPreview={hoveredWorldPreview}
    objectAssets={renderableObjectAssets}
    allObjectAssets={renderableAllObjectAssets}
    sceneProject={editing || sceneProjectEnabled ? sceneProject : undefined}
    sceneProjectReady={sceneProjectReady}
    hoveredObjectAssetId={hoveredObjectAssetId}
    hoveredObjectInstanceId={hoveredObjectInstanceId}
    editing={editing}
    onEditorSaveReady={(save) => { saveEditor.current = save }}
    uiVisible={uiVisible}
    onObjectHover={handleObjectHover}
    onSceneProjectSaved={updateSceneProject}
    onRefreshWorlds={onRefreshWorlds}
    refreshingWorlds={refreshingWorlds}
  />
  return <SceneWorkspace
    worlds={worlds}
    entry={entry}
    uiVisible={uiVisible}
    editing={editing}
    onPreview={async () => { if (!saveEditor.current || await saveEditor.current()) { setSceneProjectEnabled(true); navigate(`/${entry.slug}`) } }}
    sceneProject={sceneProject}
    sceneEnabled={sceneProjectActive}
    onSceneToggle={() => setSceneProjectEnabled((enabled) => !enabled)}
    worldVersion={activeWorldVersionIndex}
    onVersionChange={(index) => setSelectedWorldVersions((versions) => ({ ...versions, [entry.slug]: index }))}
    onObjectHover={handleObjectHover}
    refreshing={refreshingWorlds}
    onRefresh={onRefreshWorlds}
    hoveredObjectAssetId={hoveredObjectAssetId}
    hoveredObjectInstanceId={hoveredObjectInstanceId}
    onWorldHover={handleWorldHover}
  >{viewer}</SceneWorkspace>

}
