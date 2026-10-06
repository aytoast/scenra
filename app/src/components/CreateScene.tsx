import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { ArrowLeftIcon, ImageIcon, UploadSimpleIcon, ArrowRightIcon } from '@phosphor-icons/react'
import { chrome } from './AppChrome'
import './create-scene.css'

type Job = { id: string; slug: string; title: string; status: 'queued' | 'running' | 'completed' | 'error'; phase: number; detail: string; error?: string }
type Upload = { name: string; data: string }
async function upload(file: File): Promise<Upload> {
  if (file.size > 40 * 1024 * 1024) throw new Error(`${file.name} exceeds 40 MB.`)
  return { name: file.name, data: await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('File could not be read.')); reader.readAsDataURL(file) }) }
}
async function api(route: string, input?: unknown) {
  const response = await fetch(`/__scene-api/${route}`, { ...(input ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) } : {}), cache: 'no-store' })
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Scene creation needs local application server.')
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'Scene request failed.')
  return result
}

export function CreateScene({ refresh }: { refresh: () => Promise<void> }) {
  const [, navigate] = useLocation()
  const [mode, setMode] = useState<'generate' | 'import'>('generate')
  const [title, setTitle] = useState('New scene')
  const [image, setImage] = useState<File>()
  const [preview, setPreview] = useState('')
  const [description, setDescription] = useState('')
  const [objects, setObjects] = useState('')
  const [performers, setPerformers] = useState(true)
  const [splat, setSplat] = useState<File>()
  const [collider, setCollider] = useState<File>()
  const [props, setProps] = useState<File[]>([])
  const [metadata, setMetadata] = useState<File>()
  const [job, setJob] = useState<Job | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [providers, setProviders] = useState<{ world: boolean; images: boolean; objects: boolean } | null>(null)
  const requestId = useRef(crypto.randomUUID())
  useEffect(() => {
    void api('status').then(setProviders).catch(() => {})
    const saved = localStorage.getItem('scene-creation-job')
    if (saved) { requestId.current = saved as typeof requestId.current; void api(`jobs/${saved}`).then(setJob).catch(() => {}) }
  }, [])
  useEffect(() => {
    if (!image) { setPreview(''); return }
    const url = URL.createObjectURL(image); setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [image])
  useEffect(() => {
    if (!job || !['queued', 'running'].includes(job.status)) return
    let active = true
    const interval = window.setInterval(() => { void api(`jobs/${job.id}`).then(result => { if (active) { setJob(result); setError('') } }).catch(() => { if (active) setError('Connection interrupted. Progress will reconnect automatically.') }) }, 2000)
    return () => { active = false; window.clearInterval(interval) }
  }, [job?.id, job?.status])
  const submit = async () => {
    setError(''); setBusy(true)
    localStorage.setItem('scene-creation-job', requestId.current)
    try {
      const input = { id: requestId.current, title, performers, ...(image ? { image: await upload(image) } : {}) }
      const result = mode === 'generate'
        ? await api('generate', { ...input, description, objects: objects.split(/\n|,/).map(item => item.trim()).filter(Boolean) })
        : await api('import', { ...input, splat: splat ? await upload(splat) : undefined, collider: collider ? await upload(collider) : undefined, props: await Promise.all(props.map(upload)), metadata: metadata ? JSON.parse(await metadata.text()) : undefined })
      setJob(result)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Scene could not be created.')
      // Same ID lets retry recover accepted request instead of duplicating paid work.
      try { setJob(await api(`jobs/${requestId.current}`)) } catch {}
    } finally { setBusy(false) }
  }
  const resume = async () => {
    if (!job) return
    setBusy(true); setError('')
    try { setJob(await api('resume', {id:job.id,title:job.title})) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Resume failed.') }
    finally { setBusy(false) }
  }
  const openScene = async () => { await refresh(); navigate(`/${job!.slug}`) }
  const another = () => { setJob(null); setError(''); requestId.current = crypto.randomUUID(); localStorage.removeItem('scene-creation-job') }
  const unavailable = providers && (!providers.world || (objects.trim() && (!providers.images || !providers.objects)))
  return <main className="scene-create">
    <div className={`scene-create-panel ${chrome.panel}`}>
      <header><button onClick={() => navigate('/')}><ArrowLeftIcon size={16} />Back to scene</button><span>scenra</span></header>
      <h1>Create scene</h1><p>Bring in world, performers, and props. Explore, interact, and record camera view.</p>
      {job ? <section className="creation-progress">
        <h2>{job.title}</h2><ol>{['Prepare image', 'Build world', 'Create props', 'Add physics', 'Ready to explore'].map((step, index) => <li key={step} className={index < job.phase || job.status === 'completed' ? 'done' : index === job.phase ? 'active' : ''}><span>{index + 1}</span>{step}</li>)}</ol>
        <p role="status">{job.detail}</p>
        {job.error && <p className="creation-error" role="alert">{job.error}</p>}
        {job.status === 'error' && <><p>Completed assets are saved. Check provider billing or access before resuming. Saved outputs are reused; remaining generation may use API credits.</p><button disabled={busy} onClick={resume}>{busy ? 'Resuming…' : 'Resume saved work'}</button></>}
        {job.status === 'completed' && <button className="creation-primary" onClick={openScene}>Open scene<ArrowRightIcon size={16} /></button>}
        {['completed','error'].includes(job.status) && <button onClick={another}>Create another scene</button>}
      </section> : <>
        <div className="creation-modes"><button aria-pressed={mode === 'generate'} onClick={() => setMode('generate')}><ImageIcon size={16} />From image</button><button aria-pressed={mode === 'import'} onClick={() => setMode('import')}><UploadSimpleIcon size={16} />Import assets</button></div>
        <label>Scene name<input value={title} maxLength={80} onChange={event => setTitle(event.target.value)} /></label>
        <div className="creation-fields">
          <section><h2>{mode === 'generate' ? '1. Upload reference image' : '1. Import world'}</h2>
            {mode === 'generate' ? <><label className="creation-upload">PNG, JPEG, or WebP<input aria-label="Source image" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => setImage(event.target.files?.[0])} /></label>{preview && <img className="creation-preview" src={preview} alt="Uploaded reference" />}</> : <>
              <label>World view (.spz)<input aria-label="World splat" type="file" accept=".spz" onChange={event => setSplat(event.target.files?.[0])} /></label>
              <label>World collision mesh (.glb), optional<input aria-label="World collision mesh" type="file" accept=".glb" onChange={event => setCollider(event.target.files?.[0])} /></label>
              <label>World Labs metadata (.json), optional<input aria-label="World metadata" type="file" accept=".json" onChange={event => setMetadata(event.target.files?.[0])} /></label>
              <p>Import SPZ and collision mesh from World Labs export. Metadata preserves world scale and ground alignment.</p>
            </>}
          </section>
          <section><h2>2. Props and performers</h2>
            {mode === 'generate' ? <><label>Movable objects<textarea value={objects} onChange={event => setObjects(event.target.value)} placeholder="Wooden bench, tea table, incense burner" /></label><p>Separate names with commas or new lines. Image model separates props; Tripo turns them into movable models.</p><label>World description, optional<textarea value={description} maxLength={1500} onChange={event => setDescription(event.target.value)} placeholder="Describe atmosphere and scene details" /></label></> : <label>Prop models (.glb), up to 8<input aria-label="Prop models" type="file" accept=".glb" multiple onChange={event => setProps(Array.from(event.target.files || []))} /><span>{props.map(file => file.name).join(', ')}</span></label>}
            <label className="creation-check"><input type="checkbox" checked={performers} onChange={event => setPerformers(event.target.checked)} />Include saved Stageon fighters</label><p>Two performers with saved fighting motion and prop collisions. Move props in scene editor after loading.</p>
          </section>
        </div>
        <section className="creation-finish"><h2>3. Explore and record</h2><p>Fly through scene, interact with props, then use Record view to export video from your perspective.</p></section>
        {mode === 'generate' && <p>Generation uses World Labs, OpenAI, and Tripo API credits. Import assets uses no generation credits.</p>}
        {mode === 'generate' && unavailable && <p className="creation-error">Required provider keys are missing. Configure local API keys or import existing assets.</p>}
        <button className="creation-primary" disabled={busy || !title.trim() || (mode === 'generate' ? !image || Boolean(unavailable) : !splat)} onClick={submit}>{busy ? 'Uploading…' : mode === 'generate' ? 'Generate scene' : 'Import scene'}<ArrowRightIcon size={16} /></button>
      </>}
      {error && <p className="creation-error" role="alert">{error}</p>}
    </div>
  </main>
}
