import { useEffect, useState } from 'react'
import { AppButton } from './AppButton'

interface Props {
  canvas: HTMLCanvasElement | null
  fieldOfView: number
  onFieldOfViewChange: (value: number) => void
  visible: boolean
}

export function FirstPersonControls({ canvas, fieldOfView, onFieldOfViewChange, visible }: Props) {
  const [locked, setLocked] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const update = () => { setLocked(Boolean(canvas && document.pointerLockElement === canvas)); setError('') }
    const failed = () => setError('Mouse capture unavailable. Right-drag to look.')
    document.addEventListener('pointerlockchange', update)
    document.addEventListener('pointerlockerror', failed)
    update()
    return () => {
      document.removeEventListener('pointerlockchange', update)
      document.removeEventListener('pointerlockerror', failed)
      if (canvas && document.pointerLockElement === canvas) document.exitPointerLock()
    }
  }, [canvas])

  const enterScene = () => {
    setError('')
    try {
      const request = canvas?.requestPointerLock()
      request?.catch(() => setError('Mouse capture unavailable. Right-drag to look.'))
    } catch {
      setError('Mouse capture unavailable. Right-drag to look.')
    }
  }

  if (!visible) return null

  return (
    <>
      {locked && <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 z-20 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white ring-1 ring-black/60" />}
      <div className="chrome-glass pointer-events-none absolute left-1/2 top-2 z-30 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg border border-white/15 px-3 py-2 text-xs text-white">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          {!locked && <AppButton disabled={!canvas} onClick={enterScene} className="pointer-events-auto bg-white/15 opacity-100">Enter scene</AppButton>}
          <span>WASD move · {locked ? 'Mouse look' : 'Right-drag look'} · Space jump · Left-drag grab{locked ? ' · ESC release mouse' : ''}</span>
          {!locked && <label className="pointer-events-auto flex items-center gap-2">FOV
            <input aria-label="Field of view" type="range" min={35} max={100} value={fieldOfView} onChange={(event) => onFieldOfViewChange(Number(event.target.value))} className="w-20" />
            <span className="w-8 tabular-nums">{Math.round(fieldOfView)}°</span>
          </label>}
        </div>
        {error && <p role="status" className="mt-1 text-center text-amber-200">{error}</p>}
      </div>
    </>
  )
}
