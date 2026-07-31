import { useEffect, useRef } from 'react'
import {
  buildSpectrumFromPreview,
  sampleFallback,
  sampleSpectrum,
  type SpectrumData
} from '../audio/previewSpectrum'

const TARGET_FPS = 30
const FRAME_MS = 1000 / TARGET_FPS
const BANDS = 24

interface Props {
  trackId: string | undefined
  previewUrl?: string | null
  progressMs: number
  durationMs: number
  active: boolean
}

/**
 * Background spectrum from Spotify 30s preview (offline analysis),
 * with a procedural fallback so bars always move while playing.
 */
export default function BeatVisualizer({
  trackId,
  previewUrl,
  progressMs,
  durationMs,
  active
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const spectrumRef = useRef<SpectrumData | null>(null)
  const levelsRef = useRef(new Float32Array(BANDS).fill(0.1))
  const targetRef = useRef(new Float32Array(BANDS).fill(0.1))
  const progressRef = useRef(progressMs)
  const durationRef = useRef(durationMs)
  const activeRef = useRef(active)
  const trackIdRef = useRef(trackId ?? '')
  const rafRef = useRef(0)
  const lastFrameRef = useRef(0)

  progressRef.current = progressMs
  durationRef.current = durationMs
  activeRef.current = active
  trackIdRef.current = trackId ?? ''

  useEffect(() => {
    let cancelled = false
    spectrumRef.current = null

    // Only use preview_url already on the playback item — never call getTrack
    // just for visuals (that was an easy way to burn quota on every track change).
    const url = previewUrl ?? null
    if (!trackId || !url) return

    void (async () => {
      try {
        const data = await buildSpectrumFromPreview(trackId, url)
        if (!cancelled && data) spectrumRef.current = data
      } catch {
        if (!cancelled) spectrumRef.current = null
      }
    })()

    return () => {
      cancelled = true
    }
  }, [trackId, previewUrl])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    const resize = (): void => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const { width, height } = canvas.getBoundingClientRect()
      const w = Math.max(1, Math.floor(width * dpr))
      const h = Math.max(1, Math.floor(height * dpr))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const draw = (now: number): void => {
      rafRef.current = requestAnimationFrame(draw)
      if (now - lastFrameRef.current < FRAME_MS) return
      lastFrameRef.current = now
      if (document.hidden) return

      resize()
      const { width, height } = canvas
      const levels = levelsRef.current
      const targets = targetRef.current
      const spectrum = spectrumRef.current
      const isActive = activeRef.current
      const progress = progressRef.current

      if (spectrum) {
        sampleSpectrum(spectrum, progress, durationRef.current, targets)
        if (!isActive) {
          for (let i = 0; i < BANDS; i++) targets[i] *= 0.35
        }
      } else {
        // Wall-clock phase — progress alone only updates ~4Hz from polling
        sampleFallback(isActive ? now : progress, trackIdRef.current || 'x', isActive, targets)
      }

      const ease = isActive ? 0.4 : 0.14
      for (let i = 0; i < BANDS; i++) {
        levels[i] += (targets[i] - levels[i]) * ease
      }

      ctx.clearRect(0, 0, width, height)

      const accent =
        getComputedStyle(canvas).getPropertyValue('--accent').trim() || '#1db954'
      const gap = width * 0.01
      const barW = (width - gap * (BANDS - 1)) / BANDS
      const maxA = isActive ? 0.48 : 0.2

      const floor = ctx.createLinearGradient(0, height * 0.45, 0, height)
      floor.addColorStop(0, 'transparent')
      floor.addColorStop(0.55, hexAlpha(accent, 0.04))
      floor.addColorStop(1, hexAlpha(accent, 0.12))
      ctx.fillStyle = floor
      ctx.fillRect(0, 0, width, height)

      for (let i = 0; i < BANDS; i++) {
        const h = Math.max(3, levels[i] * height * 0.62)
        const x = i * (barW + gap)
        const y = height - h
        const g = ctx.createLinearGradient(x, y, x, height)
        g.addColorStop(0, hexAlpha(accent, 0.05))
        g.addColorStop(0.35, hexAlpha(accent, maxA * (0.35 + levels[i] * 0.45)))
        g.addColorStop(1, hexAlpha(accent, maxA * (0.15 + levels[i] * 0.25)))
        ctx.fillStyle = g
        const r = Math.min(barW / 2, 4 * (window.devicePixelRatio || 1))
        roundRect(ctx, x, y, barW, h, r)
        ctx.fill()
      }
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(rafRef.current)
      ro.disconnect()
    }
  }, [])

  return <canvas ref={canvasRef} className="beat-viz" aria-hidden />
}

function hexAlpha(color: string, alpha: number): string {
  const a = Math.min(1, Math.max(0, alpha))
  const hex = color.trim()
  if (hex.startsWith('#') && (hex.length === 7 || hex.length === 4)) {
    let r = 0
    let g = 0
    let b = 0
    if (hex.length === 7) {
      r = parseInt(hex.slice(1, 3), 16)
      g = parseInt(hex.slice(3, 5), 16)
      b = parseInt(hex.slice(5, 7), 16)
    } else {
      r = parseInt(hex[1] + hex[1], 16)
      g = parseInt(hex[2] + hex[2], 16)
      b = parseInt(hex[3] + hex[3], 16)
    }
    return `rgba(${r}, ${g}, ${b}, ${a})`
  }
  return color.startsWith('rgb')
    ? color.replace(/rgba?\(([^)]+)\)/, (_, body: string) => {
        const parts = body.split(',').map((p) => p.trim())
        return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${a})`
      })
    : color
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, [radius, radius, 0, 0])
    return
  }
  ctx.rect(x, y, w, h)
}
