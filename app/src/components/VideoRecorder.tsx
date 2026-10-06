import { useEffect, useRef, type RefObject } from 'react'
import { create } from 'zustand'
import { RecordIcon, StopIcon, DownloadSimpleIcon } from '@phosphor-icons/react'
import { chrome } from './AppChrome'
import { useXRStore } from '../modules/xr/store'

const useRecording = create<{ recording: boolean; seconds: number; url: string; filename: string; error: string }>(() => ({ recording: false, seconds: 0, url: '', filename: '', error: '' }))
export function VideoRecorder({ viewport, visible }: { viewport: RefObject<HTMLDivElement | null>; visible: boolean }) {
  const state = useRecording()
  const xrActive = useXRStore((state) => state.active)
  const xrMode = useXRStore((state) => state.mode)
  const recorder = useRef<MediaRecorder | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const stream = useRef<MediaStream | null>(null)
  useEffect(() => { if (xrActive && recorder.current?.state === 'recording') recorder.current.stop() }, [xrActive])
  useEffect(() => () => {
    window.clearInterval(timer.current)
    if (recorder.current?.state !== 'inactive') recorder.current?.stop()
    else stream.current?.getTracks().forEach(track => track.stop())
  }, [])

  const start = () => {
    const canvas = viewport.current?.querySelector('canvas')
    if (!canvas || !('captureStream' in canvas) || !('MediaRecorder' in window)) { useRecording.setState({ error: 'Video recording requires Chrome or Edge.' }); return }
    const chunks: Blob[] = []
    try {
      const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type))
      const capture = canvas.captureStream(30)
      stream.current = capture
      const recording = new MediaRecorder(capture, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 8_000_000 })
      recorder.current = recording
      const started = performance.now()
      recording.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
      recording.onstop = () => {
        window.clearInterval(timer.current)
        capture.getTracks().forEach(track => track.stop())
        const blob = new Blob(chunks, { type: recording.mimeType || 'video/webm' })
        const previous = useRecording.getState().url
        if (previous) URL.revokeObjectURL(previous)
        useRecording.setState({ recording: false, seconds: Math.round((performance.now() - started) / 1000), url: blob.size ? URL.createObjectURL(blob) : '', filename: `scene-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`, ...(!blob.size ? { error: 'Recording is empty. Try again.' } : {}) })
      }
      recording.onerror = () => { useRecording.setState({ error: 'Recording failed. Try again.', recording: false }); window.clearInterval(timer.current); capture.getTracks().forEach(track => track.stop()) }
      recording.start(1000)
      useRecording.setState({ recording: true, seconds: 0, error: '' })
      timer.current = window.setInterval(() => useRecording.setState({ seconds: Math.floor((performance.now() - started) / 1000) }), 1000)
    } catch (error) {
      stream.current?.getTracks().forEach(track => track.stop())
      useRecording.setState({ recording: false, error: error instanceof Error ? error.message : 'Recording could not start.' })
    }
  }
  return <div className={`scene-recording ${chrome.panel} ${chrome.enter}`} hidden={!visible}>
    {state.recording ? <button onClick={() => { if (recorder.current?.state !== 'inactive') recorder.current?.stop() }}><StopIcon size={14} weight="fill" />Stop recording</button> : <button disabled={xrActive} onClick={start}><RecordIcon size={14} />Record view</button>}
    <span aria-live="polite">{xrActive ? xrMode === 'simulator' ? 'Exit simulator to record camera view' : 'Use headset system recording in VR' : state.recording ? `${state.seconds}s · recording` : 'Camera view · WebM'}</span>
    {!state.recording && state.url && <a href={state.url} download={state.filename}><DownloadSimpleIcon size={14} />Download video</a>}
    {state.error && <p role="alert">{state.error}</p>}
  </div>
}
