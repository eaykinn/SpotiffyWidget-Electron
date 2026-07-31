const BANDS = 24
const FPS = 20

export type SpectrumData = {
  bands: number
  frameCount: number
  /** row-major: frameCount * bands, values 0..1 */
  frames: Float32Array
  durationMs: number
}

const cache = new Map<string, SpectrumData>()

function toArrayBuffer(data: ArrayBuffer | Uint8Array | unknown): ArrayBuffer | null {
  if (data instanceof ArrayBuffer) return data
  if (data instanceof Uint8Array) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
  }
  // Electron sometimes delivers a plain object / Buffer-like
  if (data && typeof data === 'object' && 'byteLength' in data) {
    try {
      const view = data as ArrayBufferView
      return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)
    } catch {
      return null
    }
  }
  return null
}

/** Crude octave-ish filter bank — good enough for bar visualizers, cheap. */
function bandEnergies(slice: Float32Array, bandCount: number): Float32Array {
  const out = new Float32Array(bandCount)
  let data = slice
  for (let b = 0; b < bandCount; b++) {
    if (data.length < 4) {
      out[b] = out[Math.max(0, b - 1)] ?? 0
      continue
    }
    let sum = 0
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
    out[b] = Math.sqrt(sum / data.length)
    const next = new Float32Array(Math.floor(data.length / 2))
    for (let i = 0; i < next.length; i++) {
      next[i] = (data[i * 2] + data[i * 2 + 1]) * 0.5
    }
    data = next
  }
  return out
}

function normalizeFrames(frames: Float32Array, frameCount: number, bands: number): void {
  // Per-band normalize so bars diverge instead of all looking equal
  for (let b = 0; b < bands; b++) {
    let max = 0.0001
    for (let f = 0; f < frameCount; f++) {
      const v = frames[f * bands + b]
      if (v > max) max = v
    }
    for (let f = 0; f < frameCount; f++) {
      const i = f * bands + b
      frames[i] = Math.pow(frames[i] / max, 0.55)
    }
  }
  // Light temporal smoothing
  for (let f = 1; f < frameCount; f++) {
    const base = f * bands
    const prev = (f - 1) * bands
    for (let b = 0; b < bands; b++) {
      frames[base + b] = frames[base + b] * 0.65 + frames[prev + b] * 0.35
    }
  }
}

export async function buildSpectrumFromPreview(
  trackId: string,
  previewUrl: string
): Promise<SpectrumData | null> {
  const cached = cache.get(trackId)
  if (cached) return cached

  const raw = await window.spotiffy.audio.fetchPreview(previewUrl)
  const ab = toArrayBuffer(raw)
  if (!ab || ab.byteLength === 0) return null

  const ctx = new AudioContext()
  let audio: AudioBuffer
  try {
    audio = await ctx.decodeAudioData(ab.slice(0))
  } finally {
    void ctx.close()
  }
  const channel = audio.numberOfChannels > 0 ? audio.getChannelData(0) : null
  if (!channel || channel.length === 0) return null

  const frameSamples = Math.max(256, Math.floor(audio.sampleRate / FPS))
  const frameCount = Math.max(1, Math.floor(channel.length / frameSamples))
  const frames = new Float32Array(frameCount * BANDS)

  for (let f = 0; f < frameCount; f++) {
    const start = f * frameSamples
    const slice = channel.subarray(start, start + frameSamples)
    frames.set(bandEnergies(slice, BANDS), f * BANDS)
  }

  normalizeFrames(frames, frameCount, BANDS)

  const data: SpectrumData = {
    bands: BANDS,
    frameCount,
    frames,
    durationMs: (audio.duration || frameCount / FPS) * 1000
  }
  cache.set(trackId, data)
  return data
}

/**
 * Scrub preview analysis in realtime (loops), so long tracks keep moving.
 * Full-track ratio mapping made 7min songs look almost frozen.
 */
export function sampleSpectrum(
  data: SpectrumData,
  progressMs: number,
  _trackDurationMs: number,
  out: Float32Array
): void {
  const bands = data.bands
  if (out.length < bands || data.frameCount < 1) {
    out.fill(0.12)
    return
  }

  const loopMs = Math.max(1, data.durationMs)
  const ratio = (progressMs % loopMs) / loopMs
  const pos = ratio * (data.frameCount - 1)
  const i0 = Math.floor(pos)
  const i1 = Math.min(data.frameCount - 1, i0 + 1)
  const t = pos - i0
  const a = i0 * bands
  const b = i1 * bands
  for (let i = 0; i < bands; i++) {
    out[i] = data.frames[a + i] * (1 - t) + data.frames[b + i] * t
  }
}

/** Always-moving procedural bars when preview is missing. */
export function sampleFallback(
  progressMs: number,
  trackId: string,
  active: boolean,
  out: Float32Array
): void {
  const bands = out.length
  if (!active) {
    for (let i = 0; i < bands; i++) out[i] = 0.1 + (i % 5) * 0.01
    return
  }
  let seed = 0
  for (let i = 0; i < trackId.length; i++) seed = (seed + trackId.charCodeAt(i) * (i + 1)) % 9973
  const t = progressMs / 1000
  for (let i = 0; i < bands; i++) {
    const n = ((seed + i * 37) % 100) / 100
    const wave =
      0.28 +
      0.32 * Math.sin(t * (2.1 + n) + i * 0.55) +
      0.22 * Math.sin(t * (3.4 + n * 0.5) + i * 1.1) +
      0.12 * Math.sin(t * 6.2 + i * 0.3 + n)
    const center = 1 - Math.abs(i - (bands - 1) / 2) / (bands / 2)
    out[i] = Math.min(1, Math.max(0.06, wave * (0.55 + 0.45 * center)))
  }
}
