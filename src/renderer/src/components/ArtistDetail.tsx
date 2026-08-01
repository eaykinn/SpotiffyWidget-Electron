import { useEffect, useMemo, useState } from 'react'
import { coverOf, spotify } from '../api/spotify'
import { likesStore } from '../likes/likesStore'
import { sortTracks, type TrackSortDir, type TrackSortKey } from '../lib/trackSort'
import type { Album, Artist, Track } from '../types/spotify'
import AlbumDetail from './AlbumDetail'
import { IconBack, IconPlay, IconViewCompact, IconViewNormal } from './Icons'
import TrackCard from './TrackCard'
import TrackSortBar from './TrackSortBar'

type ArtistTab = 'top' | 'albums' | 'all'

interface Props {
  artist: Artist
  compact: boolean
  onToggleCompact: () => void
  onBack: () => void
  onPlayTrack: (uri: string) => void
  onPlayTracks: (uris: string[]) => void
  onPlayContext: (contextUri: string) => void
}

async function resolveLikedMap(tracks: Track[]): Promise<Record<string, boolean>> {
  const ids = tracks.map((t) => t.id).filter(Boolean)
  await likesStore.ensure(ids)
  const map: Record<string, boolean> = {}
  for (const id of ids) map[id] = Boolean(likesStore.get(id))
  return map
}

function formatFollowers(n: number): string {
  return n.toLocaleString('tr-TR')
}

function formatRelease(date?: string): string {
  if (!date) return '—'
  if (/^\d{4}$/.test(date)) return date
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return date
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: date.length >= 10 ? 'numeric' : undefined
  })
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

function matchesAlbumQuery(album: Album, raw: string): boolean {
  const q = raw.trim().toLocaleLowerCase('tr-TR')
  if (!q) return true
  return (album.name || '').toLocaleLowerCase('tr-TR').includes(q)
}

async function fetchArtistAlbums(artistId: string): Promise<Album[]> {
  const albums: Album[] = []
  let offset = 0
  let total = Infinity
  while (offset < total) {
    const page = await spotify.getArtistAlbumsPage(artistId, 50, offset)
    total = page.total
    albums.push(...page.items)
    offset += page.items.length
    if (!page.next || page.items.length === 0) break
  }

  const unique: Album[] = []
  const seen = new Set<string>()
  for (const a of albums) {
    if (!a.id || seen.has(a.id)) continue
    seen.add(a.id)
    unique.push(a)
  }
  // Newest first
  unique.sort((a, b) => (b.release_date || '').localeCompare(a.release_date || ''))
  return unique
}

export default function ArtistDetail({
  artist: seed,
  compact,
  onToggleCompact,
  onBack,
  onPlayTrack,
  onPlayTracks,
  onPlayContext
}: Props) {
  const [artist, setArtist] = useState<Artist>(seed)
  const [tab, setTab] = useState<ArtistTab>('top')
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<TrackSortKey>('name')
  const [sortDir, setSortDir] = useState<TrackSortDir>('asc')
  const [topTracks, setTopTracks] = useState<Track[]>([])
  const [allTracks, setAllTracks] = useState<Track[]>([])
  const [albums, setAlbums] = useState<Album[]>([])
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({})
  const [loadingHeader, setLoadingHeader] = useState(true)
  const [loadingTracks, setLoadingTracks] = useState(true)
  const [loadingAll, setLoadingAll] = useState(false)
  const [loadingAlbums, setLoadingAlbums] = useState(false)
  const [allProgress, setAllProgress] = useState<string | null>(null)
  const [allLoaded, setAllLoaded] = useState(false)
  const [albumsLoaded, setAlbumsLoaded] = useState(false)
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoadingHeader(true)
    setError(null)
    setQuery('')
    setTab('top')
    setAllTracks([])
    setAllLoaded(false)
    setAlbums([])
    setAlbumsLoaded(false)
    setSelectedAlbum(null)

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

  // Full catalog = 1 request per album — only when user opens All.
  const needsAllCatalog = tab === 'all'

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

  // Albums tab — list only (no per-album track fetch until click).
  useEffect(() => {
    if (tab !== 'albums' || albumsLoaded) return

    let cancelled = false
    setLoadingAlbums(true)

    void (async () => {
      try {
        const items = await fetchArtistAlbums(seed.id)
        if (cancelled) return
        setAlbums(items)
        setAlbumsLoaded(true)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load albums')
        }
      } finally {
        if (!cancelled) setLoadingAlbums(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [tab, seed.id, albumsLoaded])

  const cover = coverOf(artist.images)
  const genres = artist.genres?.filter(Boolean) ?? []
  const followers = artist.followers?.total ?? 0
  const popularity = artist.popularity ?? 0

  const sourceTracks = useMemo(() => {
    let base: Track[]
    if (query.trim()) {
      base = (tab === 'all' && allTracks.length > 0 ? allTracks : topTracks).filter((t) =>
        matchesQuery(t, query)
      )
    } else if (tab === 'top') {
      base = topTracks
    } else if (tab === 'all') {
      base = allTracks
    } else {
      base = []
    }
    return sortTracks(base, sortKey, sortDir)
  }, [query, tab, topTracks, allTracks, sortKey, sortDir])

  const visibleAlbums = useMemo(() => {
    if (!query.trim()) return albums
    return albums.filter((a) => matchesAlbumQuery(a, query))
  }, [albums, query])

  const busyTracks =
    (tab === 'top' && !query.trim() && loadingTracks) ||
    (tab === 'all' && loadingAll && !allLoaded)
  const busyAlbums = tab === 'albums' && loadingAlbums && !albumsLoaded
  const isAlbums = tab === 'albums'

  if (selectedAlbum) {
    return (
      <AlbumDetail
        album={selectedAlbum}
        compact={compact}
        onToggleCompact={onToggleCompact}
        onBack={() => setSelectedAlbum(null)}
        onPlayTrack={onPlayTrack}
        onPlayTracks={onPlayTracks}
        onPlayContext={onPlayContext}
      />
    )
  }

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

      <div className="list-toolbar artist-detail__toolbar">
        <div className="segment segment--inline artist-detail__tabs">
          <button
            className={tab === 'top' && !query.trim() ? 'active' : ''}
            onClick={() => {
              setTab('top')
              setQuery('')
            }}
          >
            Top
          </button>
          <button
            className={tab === 'albums' ? 'active' : ''}
            onClick={() => {
              setTab('albums')
              setQuery('')
            }}
          >
            Albums
          </button>
          <button
            className={tab === 'all' && !query.trim() ? 'active' : ''}
            onClick={() => setTab('all')}
          >
            All
          </button>
        </div>
        <input
          className="search search--compact"
          placeholder={isAlbums ? 'Search albums…' : 'Search songs…'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {!isAlbums && (
          <button
            type="button"
            className="btn-play-all"
            disabled={sourceTracks.length === 0 || busyTracks}
            title="Play all in order"
            onClick={() => onPlayTracks(sourceTracks.map((t) => t.uri))}
          >
            <IconPlay />
            <span>Play</span>
          </button>
        )}
      </div>
      {!isAlbums && (
        <div className="list-toolbar list-toolbar--sort">
          <TrackSortBar
            sortKey={sortKey}
            sortDir={sortDir}
            showAdded={false}
            onChange={(key, dir) => {
              setSortKey(key)
              setSortDir(dir)
            }}
          />
        </div>
      )}

      {error && (
        <div className="list-status" style={{ color: 'var(--danger)' }}>
          {error}
        </div>
      )}
      {allProgress && tab === 'all' && <div className="list-status">{allProgress}</div>}

      <div className="scroll artist-detail__list">
        {isAlbums ? (
          <>
            {busyAlbums && <div className="empty">Loading albums…</div>}
            {!busyAlbums && (
              <div className={`list ${compact ? 'list--compact' : ''}`}>
                {visibleAlbums.map((a) => {
                  const tracksLabel =
                    typeof a.total_tracks === 'number'
                      ? `${a.total_tracks} track${a.total_tracks === 1 ? '' : 's'}`
                      : null
                  const typeLabel = a.album_type
                    ? a.album_type.charAt(0).toUpperCase() + a.album_type.slice(1)
                    : null
                  const sub = [formatRelease(a.release_date), tracksLabel, typeLabel]
                    .filter(Boolean)
                    .join(' · ')
                  return (
                    <button
                      key={a.id}
                      type="button"
                      className={`list-item ${compact ? 'list-item--compact' : ''}`}
                      onClick={() => setSelectedAlbum(a)}
                    >
                      {(() => {
                        const art = coverOf(a.images)
                        return art ? <img src={art} alt="" /> : <div className="list-item__art-empty" />
                      })()}
                      <div className="list-item__meta">
                        <div className="list-item__title">{a.name}</div>
                        <div className="list-item__sub">{sub || 'Album'}</div>
                      </div>
                    </button>
                  )
                })}
                {visibleAlbums.length === 0 && (
                  <div className="empty">{query.trim() ? 'No albums found' : 'No albums'}</div>
                )}
                {visibleAlbums.length > 0 && (
                  <div className="list-sentinel">
                    <span>
                      {visibleAlbums.length} album{visibleAlbums.length === 1 ? '' : 's'}
                      {query.trim() ? ' found' : ''}
                    </span>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            {busyTracks && sourceTracks.length === 0 && <div className="empty">Loading…</div>}
            {!busyTracks || sourceTracks.length > 0 ? (
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
                {!busyTracks && sourceTracks.length === 0 && <div className="empty">No tracks</div>}
                {!busyTracks && sourceTracks.length > 0 && (
                  <div className="list-sentinel">
                    <span>
                      {sourceTracks.length} track{sourceTracks.length === 1 ? '' : 's'}
                      {query.trim() ? ' found' : ''}
                    </span>
                  </div>
                )}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
