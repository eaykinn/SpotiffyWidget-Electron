import { spotify } from '../api/spotify'

type Listener = () => void

const cache = new Map<string, boolean>()
const listeners = new Set<Listener>()
const inflight = new Set<string>()
const pending = new Set<string>()
let flushTimer: ReturnType<typeof setTimeout> | null = null
/** After 429 / errors, stop retrying contains checks for a while. */
let cooldownUntil = 0

function emit(): void {
  listeners.forEach((fn) => fn())
}

async function fetchMissing(ids: string[]): Promise<void> {
  if (Date.now() < cooldownUntil) return

  const missing = ids.filter((id) => id && !cache.has(id) && !inflight.has(id))
  if (missing.length === 0) return

  for (const id of missing) inflight.add(id)

  try {
    for (let i = 0; i < missing.length; i += 50) {
      if (Date.now() < cooldownUntil) break
      const chunk = missing.slice(i, i + 50)
      try {
        const flags = await spotify.checkSaved(chunk)
        const map: Record<string, boolean> = {}
        chunk.forEach((id, idx) => {
          map[id] = Boolean(flags[idx])
        })
        likesStore.setMany(map)
      } catch {
        // Don't hammer Spotify while quota / rate limits recover.
        cooldownUntil = Date.now() + 90_000
        break
      }
    }
  } finally {
    for (const id of missing) inflight.delete(id)
  }
}

export const likesStore = {
  subscribe(fn: Listener): () => void {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },

  get(id: string | undefined | null): boolean | undefined {
    if (!id) return undefined
    return cache.get(id)
  },

  set(id: string, liked: boolean): void {
    if (!id) return
    if (cache.get(id) === liked) return
    cache.set(id, liked)
    emit()
  },

  setMany(entries: Record<string, boolean>): void {
    let changed = false
    for (const [id, liked] of Object.entries(entries)) {
      if (!id) continue
      if (cache.get(id) !== liked) {
        cache.set(id, liked)
        changed = true
      }
    }
    if (changed) emit()
  },

  markAll(ids: string[], liked: boolean): void {
    const map: Record<string, boolean> = {}
    for (const id of ids) {
      if (id) map[id] = liked
    }
    this.setMany(map)
  },

  /** Immediate batch resolve (lists / pages). */
  async ensure(ids: string[]): Promise<void> {
    await fetchMissing(Array.from(new Set(ids.filter(Boolean))))
  },

  /** Debounced resolve for individual cards mounting together. */
  ensureSoon(id: string | undefined | null): void {
    if (!id || cache.has(id) || inflight.has(id)) return
    pending.add(id)
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = setTimeout(() => {
      const batch = Array.from(pending)
      pending.clear()
      flushTimer = null
      void fetchMissing(batch)
    }, 40)
  }
}
