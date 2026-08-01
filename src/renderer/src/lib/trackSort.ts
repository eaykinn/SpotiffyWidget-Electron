import type { Track } from '../types/spotify'

export type TrackSortKey = 'name' | 'added' | 'duration'
export type TrackSortDir = 'asc' | 'desc'

export function sortTracks(tracks: Track[], key: TrackSortKey, dir: TrackSortDir): Track[] {
  const mul = dir === 'asc' ? 1 : -1
  return [...tracks].sort((a, b) => {
    let cmp = 0
    if (key === 'name') {
      cmp = (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
    } else if (key === 'added') {
      const hasA = Boolean(a.added_at)
      const hasB = Boolean(b.added_at)
      if (!hasA && !hasB) cmp = 0
      else if (!hasA) return 1
      else if (!hasB) return -1
      else cmp = Date.parse(a.added_at!) - Date.parse(b.added_at!)
    } else {
      cmp = (a.duration_ms ?? 0) - (b.duration_ms ?? 0)
    }
    if (cmp !== 0) return cmp * mul
    return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
  })
}

/** Compact date for track cards, e.g. "12 Jan 2024". */
export function formatAddedAt(iso: string | undefined | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}
