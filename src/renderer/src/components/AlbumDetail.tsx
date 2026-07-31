import { useEffect, useMemo, useState } from 'react'
import { coverOf, spotify } from '../api/spotify'
import type { Album, Track } from '../types/spotify'
import { IconBack, IconPlay, IconViewCompact, IconViewNormal } from './Icons'
import TrackCard from './TrackCard'

interface Props {
  album: Album
  compact: boolean
  onToggleCompact: () => void
  onBack: () => void
  onPlayTrack: (uri: string) => void
  onPlayTracks: (uris: string[]) => void
  onPlayContext: (contextUri: string) => void
}

async function resolveLikedMap(tracks: Track[]): Promise<Record<string, boolean>> {
  const map: Record<string, boolean> = {}
  const ids = tracks.map((t) => t.id).filter(Boolean)
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50)
    try {
      const flags = await spotify.checkSaved(chunk)
      chunk.forEach((id, idx) => {
        map[id] = Boolean(flags[idx])
      })
    } catch {
      // ignore
    }
  }
  return map
}

function matchesQuery(track: Track, raw: string): boolean {
  const q = raw.trim().toLocaleLowerCase('tr-TR')
  if (!q) return true
  const hay = [track.name, ...(track.artists?.map((a) => a.name) ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('tr-TR')
  return hay.includes(q)
}

export default function AlbumDetail({
  album: seed,
  compact,
  onToggleCompact,
  onBack,
  onPlayTrack,
  onPlayTracks,
  onPlayContext
}: Props) {
  const [album, setAlbum] = useState<Album>(seed)
  const [tracks, setTracks] = useState<Track[]>([])
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({})
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setQuery('')
    setTracks([])

    void (async () => {
      try {
        const items = await spotify.getAlbumTracks(seed.id)
        if (cancelled) return
        // getAlbumTracks attaches full album metadata onto tracks
        const full = items[0]?.album ?? seed
        setAlbum(full)
        setTracks(items)
        setLikedMap(await resolveLikedMap(items))
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load album')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [seed.id])

  const cover = coverOf(album.images?.length ? album.images : seed.images)
  const artists = album.artists?.map((a) => a.name).join(', ') || '—'
  const year = album.release_date?.slice(0, 4)
  const typeLabel = album.album_type
    ? album.album_type.charAt(0).toUpperCase() + album.album_type.slice(1)
    : 'Album'

  const visible = useMemo(
    () => (query.trim() ? tracks.filter((t) => matchesQuery(t, query)) : tracks),
    [tracks, query]
  )

  return (
    <div className="glow-card artist-detail">
      <div className="detail-header">
        <div className="detail-header__row">
          <button className="back-btn" onClick={onBack}>
            <IconBack /> Back
          </button>
          <button
            type="button"
            className="icon-btn list-view-toggle"
            onClick={onToggleCompact}
            title={compact ? 'Normal view' : 'Compact view'}
          >
            {compact ? <IconViewNormal /> : <IconViewCompact />}
          </button>
        </div>
      </div>

      <div className="artist-detail__hero">
        {cover ? (
          <img className="artist-detail__art" src={cover} alt="" />
        ) : (
          <div className="artist-detail__art artist-detail__art--empty" />
        )}
        <div className="artist-detail__info">
          <h3 className="artist-detail__name" title={album.name}>
            {album.name}
          </h3>
          <p className="artist-detail__meta-line" title={artists}>
            {artists}
          </p>
          <p className="artist-detail__genres">
            {typeLabel}
            {year ? ` · ${year}` : ''}
            {typeof album.total_tracks === 'number'
              ? ` · ${album.total_tracks} track${album.total_tracks === 1 ? '' : 's'}`
              : tracks.length > 0
                ? ` · ${tracks.length} track${tracks.length === 1 ? '' : 's'}`
                : ''}
          </p>
        </div>
      </div>

      <div className="list-toolbar">
        <input
          className="search search--compact"
          placeholder="Search songs…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="button"
          className="btn-play-all"
          disabled={loading || (tracks.length === 0 && !album.uri)}
          title="Play album"
          onClick={() => {
            if (album.uri) void onPlayContext(album.uri)
            else void onPlayTracks(tracks.map((t) => t.uri))
          }}
        >
          <IconPlay />
          <span>Play</span>
        </button>
      </div>

      {error && (
        <div className="list-status" style={{ color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      <div className="scroll artist-detail__list">
        {loading && tracks.length === 0 && <div className="empty">Loading…</div>}
        {!loading || tracks.length > 0 ? (
          <div className={`list ${compact ? 'list--compact' : ''}`}>
            {visible.map((t) => (
              <TrackCard
                key={t.id + t.uri}
                track={t}
                compact={compact}
                initialLiked={Boolean(t.id && likedMap[t.id])}
                onPlay={() => onPlayTrack(t.uri)}
              />
            ))}
            {!loading && visible.length === 0 && <div className="empty">No tracks</div>}
            {!loading && visible.length > 0 && (
              <div className="list-sentinel">
                <span>
                  {visible.length} track{visible.length === 1 ? '' : 's'}
                  {query.trim() ? ' found' : ''}
                </span>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
