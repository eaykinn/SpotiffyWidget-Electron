import { useEffect, useMemo, useState } from 'react'
import { coverOf, spotify } from '../api/spotify'
import type { Artist, Track } from '../types/spotify'
import { IconBack, IconPlay, IconViewCompact, IconViewNormal } from './Icons'
import TrackCard from './TrackCard'

type ArtistTab = 'top' | 'all'

interface Props {
  artist: Artist
  compact: boolean
  onToggleCompact: () => void
  onBack: () => void
  onPlayTrack: (uri: string) => void
  onPlayTracks: (uris: string[]) => void
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

function formatFollowers(n: number): string {
  return n.toLocaleString('tr-TR')
}

function matchesQuery(track: Track, raw: string): boolean {
  const q = raw.trim().toLocaleLowerCase('tr-TR')
  if (!q) return true
  const hay = [track.name, track.album?.name, ...(track.artists?.map((a) => a.name) ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('tr-TR')
  return hay.includes(q)
}

export default function ArtistDetail({
  artist: seed,
  compact,
  onToggleCompact,
  onBack,
  onPlayTrack,
  onPlayTracks
}: Props) {
  const [artist, setArtist] = useState<Artist>(seed)
  const [tab, setTab] = useState<ArtistTab>('top')
  const [query, setQuery] = useState('')
  const [topTracks, setTopTracks] = useState<Track[]>([])
  const [allTracks, setAllTracks] = useState<Track[]>([])
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({})
  const [loadingHeader, setLoadingHeader] = useState(true)
  const [loadingTracks, setLoadingTracks] = useState(true)
  const [loadingAll, setLoadingAll] = useState(false)
  const [allProgress, setAllProgress] = useState<string | null>(null)
  const [allLoaded, setAllLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoadingHeader(true)
    setError(null)
    setQuery('')
    setTab('top')
    setAllTracks([])
    setAllLoaded(false)

    void (async () => {
      try {
        const full = await spotify.getArtist(seed.id)
        if (cancelled) return
        setArtist(full)

        setLoadingTracks(true)
        const top = await spotify.getArtistTopTracks(seed.id)
        if (cancelled) return
        setTopTracks(top)
        setLikedMap(await resolveLikedMap(top))
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load artist')
        }
      } finally {
        if (!cancelled) {
          setLoadingHeader(false)
          setLoadingTracks(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [seed.id])

  // Load all songs when All tab is opened, or when searching from Top (deeper results)
  const needsAllCatalog = tab === 'all' || Boolean(query.trim())

  useEffect(() => {
    if (!needsAllCatalog || allLoaded) return

    let cancelled = false
    setLoadingAll(true)
    setAllProgress('Loading albums…')

    void (async () => {
      try {
        const tracks = await spotify.getArtistAllTracks(seed.id, (loaded, total) => {
          if (!cancelled) setAllProgress(`Albums ${loaded}/${total}`)
        })
        if (cancelled) return
        const likes = await resolveLikedMap(tracks)
        if (cancelled) return
        setAllTracks(tracks)
        setLikedMap((prev) => ({ ...prev, ...likes }))
        setAllLoaded(true)
        setAllProgress(null)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load songs')
          setAllProgress(null)
        }
      } finally {
        if (!cancelled) setLoadingAll(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [needsAllCatalog, seed.id, allLoaded])

  const cover = coverOf(artist.images)
  const genres = artist.genres?.filter(Boolean) ?? []
  const followers = artist.followers?.total ?? 0
  const popularity = artist.popularity ?? 0

  const sourceTracks = useMemo(() => {
    if (query.trim()) {
      // Search across all catalog when available, else top meanwhile
      const pool = allLoaded ? allTracks : topTracks
      return pool.filter((t) => matchesQuery(t, query))
    }
    return tab === 'top' ? topTracks : allTracks
  }, [query, tab, topTracks, allTracks, allLoaded])

  const busy =
    (query.trim() && loadingAll && !allLoaded) ||
    (tab === 'top' && !query.trim() && loadingTracks) ||
    (tab === 'all' && !query.trim() && loadingAll && !allLoaded)

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
          <h3 className="artist-detail__name">{artist.name}</h3>
          {loadingHeader ? (
            <p className="artist-detail__loading">Loading…</p>
          ) : (
            <>
              <p className="artist-detail__meta-line">
                <span>Popularity {popularity}</span>
                <span className="artist-detail__dot">·</span>
                <span>{formatFollowers(followers)} followers</span>
              </p>
              <p className="artist-detail__genres" title={genres.join(', ')}>
                {genres.length > 0 ? genres.slice(0, 4).join(', ') : 'No genres'}
              </p>
            </>
          )}
        </div>
      </div>

      <div className="segment artist-detail__tabs">
        <button
          className={tab === 'top' && !query.trim() ? 'active' : ''}
          onClick={() => {
            setTab('top')
            setQuery('')
          }}
        >
          Top Tracks
        </button>
        <button
          className={tab === 'all' && !query.trim() ? 'active' : ''}
          onClick={() => setTab('all')}
        >
          All Songs
        </button>
      </div>

      <div className="list-toolbar">
        <input
          className="search"
          placeholder="Search songs…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="button"
          className="btn-play-all"
          disabled={sourceTracks.length === 0 || busy}
          title="Play all in order"
          onClick={() => onPlayTracks(sourceTracks.map((t) => t.uri))}
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
      {allProgress && (tab === 'all' || query.trim()) && (
        <div className="list-status">{allProgress}</div>
      )}

      <div className="scroll artist-detail__list">
        {busy && sourceTracks.length === 0 && <div className="empty">Loading…</div>}
        {!busy || sourceTracks.length > 0 ? (
          <div className={`list ${compact ? 'list--compact' : ''}`}>
            {sourceTracks.map((t) => (
              <TrackCard
                key={t.id + t.uri}
                track={t}
                compact={compact}
                initialLiked={Boolean(t.id && likedMap[t.id])}
                onPlay={() => onPlayTrack(t.uri)}
              />
            ))}
            {!busy && sourceTracks.length === 0 && <div className="empty">No tracks</div>}
            {!busy && sourceTracks.length > 0 && (
              <div className="list-sentinel">
                <span>
                  {sourceTracks.length} track{sourceTracks.length === 1 ? '' : 's'}
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
