import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { coverOf, spotify } from '../api/spotify'
import { likesStore } from '../likes/likesStore'
import type { Album, Artist, Playlist, Track } from '../types/spotify'
import AlbumDetail from './AlbumDetail'
import ArtistDetail from './ArtistDetail'
import { IconBack, IconPlay, IconViewCompact, IconViewNormal } from './Icons'
import TrackCard from './TrackCard'

const COMPACT_KEY = 'spotiffy.listCompact'

type Tab = 'tracks' | 'artists' | 'playlists'
type TrackMode = 'liked' | 'top'
type Detail =
  | { kind: 'none' }
  | { kind: 'artist'; artist: Artist }
  | { kind: 'album'; album: Album }
  | { kind: 'playlist'; playlist: Playlist }
  | { kind: 'queue' }

interface Props {
  onPlayTrack: (uri: string) => Promise<void>
  onPlayTracks: (uris: string[]) => Promise<void>
  onPlayContext: (contextUri: string) => Promise<void>
  queueOpenSignal: number
  artistOpenSignal: { artist: Artist; n: number } | null
  albumOpenSignal: { album: Album; n: number } | null
}

const PAGE = 50

type TrackPage = { items: Track[]; total: number; next: string | null }

/** Survives tab switches so liked search / re-open doesn't re-download the whole library. */
const likedSession: { tracks: Track[]; complete: boolean; total: number } = {
  tracks: [],
  complete: false,
  total: 0
}

function syncLikedSession(tracks: Track[], complete: boolean, total?: number): void {
  likedSession.tracks = tracks
  likedSession.complete = complete
  if (typeof total === 'number') likedSession.total = total
}

async function resolveLikedMap(tracks: Track[], assumeAllLiked = false): Promise<Record<string, boolean>> {
  const ids = tracks.map((t) => t.id).filter(Boolean)
  if (assumeAllLiked) {
    likesStore.markAll(ids, true)
    const map: Record<string, boolean> = {}
    for (const id of ids) map[id] = true
    return map
  }

  await likesStore.ensure(ids)
  const map: Record<string, boolean> = {}
  for (const id of ids) {
    map[id] = Boolean(likesStore.get(id))
  }
  return map
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

function mergeTracks(prev: Track[], batch: Track[]): Track[] {
  const seen = new Set(prev.map((t) => t.id || t.uri))
  const merged = [...prev]
  for (const t of batch) {
    const key = t.id || t.uri
    if (!key || seen.has(key)) continue
    seen.add(key)
    merged.push(t)
  }
  return merged
}

function playlistSubtitle(p: Playlist): string {
  const owner = p.owner?.display_name
  const total = p.tracks?.total
  const count =
    typeof total === 'number' ? `${total} track${total === 1 ? '' : 's'}` : null
  if (owner && count) return `${owner} · ${count}`
  if (count) return count
  return owner ?? 'Playlist'
}

export default function Library({
  onPlayTrack,
  onPlayTracks,
  onPlayContext,
  queueOpenSignal,
  artistOpenSignal,
  albumOpenSignal
}: Props) {
  const [tab, setTab] = useState<Tab>('tracks')
  const [trackMode, setTrackMode] = useState<TrackMode>('liked')
  const [query, setQuery] = useState('')
  const [tracks, setTracks] = useState<Track[]>([])
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({})
  const [artists, setArtists] = useState<Artist[]>([])
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [detail, setDetail] = useState<Detail>({ kind: 'none' })
  const [detailTracks, setDetailTracks] = useState<Track[]>([])
  const [detailLikedMap, setDetailLikedMap] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [searchingLibrary, setSearchingLibrary] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [compact, setCompact] = useState(() => {
    try {
      return localStorage.getItem(COMPACT_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(COMPACT_KEY, compact ? '1' : '0')
    } catch {
      // ignore
    }
  }, [compact])

  // Main tracks list paging (liked / top / global track search)
  const [mainOffset, setMainOffset] = useState(0)
  const [mainTotal, setMainTotal] = useState(0)
  const [mainComplete, setMainComplete] = useState(false)
  const [likedLibrary, setLikedLibrary] = useState<Track[]>([])

  // Playlist detail paging
  const [detailOffset, setDetailOffset] = useState(0)
  const [detailTotal, setDetailTotal] = useState(0)
  const [detailComplete, setDetailComplete] = useState(true)

  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadingMoreRef = useRef(false)
  const fetchGen = useRef(0)
  const mainOffsetRef = useRef(0)
  const mainCompleteRef = useRef(false)
  const detailOffsetRef = useRef(0)
  const detailCompleteRef = useRef(true)
  const detailPlaylistIdRef = useRef<string | null>(null)
  const likedLibraryRef = useRef<Track[]>([])

  useEffect(() => {
    likedLibraryRef.current = likedLibrary
  }, [likedLibrary])

  const isLikedSearch = tab === 'tracks' && trackMode === 'liked' && Boolean(query.trim())
  const isTrackBrowse =
    detail.kind === 'none' &&
    tab === 'tracks' &&
    !isLikedSearch &&
    (trackMode === 'liked' || trackMode === 'top' || Boolean(query.trim()))

  const isPlaylistDetail = detail.kind === 'playlist'
  const mainHasMore = !mainComplete && mainOffset < mainTotal
  const detailHasMore = !detailComplete && detailOffset < detailTotal
  const listHasMore = isPlaylistDetail ? detailHasMore : mainHasMore && isTrackBrowse

  useEffect(() => {
    mainOffsetRef.current = mainOffset
  }, [mainOffset])
  useEffect(() => {
    mainCompleteRef.current = mainComplete
  }, [mainComplete])
  useEffect(() => {
    detailOffsetRef.current = detailOffset
  }, [detailOffset])
  useEffect(() => {
    detailCompleteRef.current = detailComplete
  }, [detailComplete])

  const lastQueueSignal = useRef(0)
  const lastArtistSignal = useRef(0)
  const lastAlbumSignal = useRef(0)

  useEffect(() => {
    if (queueOpenSignal > lastQueueSignal.current) {
      lastQueueSignal.current = queueOpenSignal
      void openQueue()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueOpenSignal])

  useEffect(() => {
    if (artistOpenSignal && artistOpenSignal.n > lastArtistSignal.current) {
      lastArtistSignal.current = artistOpenSignal.n
      void openArtist(artistOpenSignal.artist)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artistOpenSignal?.n])

  useEffect(() => {
    if (albumOpenSignal && albumOpenSignal.n > lastAlbumSignal.current) {
      lastAlbumSignal.current = albumOpenSignal.n
      void openAlbum(albumOpenSignal.album)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [albumOpenSignal?.n])

  const clearMainPaging = useCallback((): void => {
    // Keep likedSession across Liked/Top switches — only reset UI paging for the new mode.
    mainOffsetRef.current = 0
    mainCompleteRef.current = false
    likedLibraryRef.current = []
    setMainOffset(0)
    setMainTotal(0)
    setMainComplete(false)
    setLikedLibrary([])
    setTracks([])
  }, [])

  const browseKeyRef = useRef(`${tab}:${trackMode}:${detail.kind}`)

  // Single load pipeline — avoid reset/fetchGen races that left loading stuck & lists empty
  useEffect(() => {
    if (detail.kind !== 'none') return

    const browseKey = `${tab}:${trackMode}:${detail.kind}`
    if (browseKeyRef.current !== browseKey) {
      browseKeyRef.current = browseKey
      if (tab === 'tracks') clearMainPaging()
    }
    setListError(null)

    const handle = window.setTimeout(() => {
      void loadTab()
    }, query ? 300 : 0)
    return () => window.clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, trackMode, query, detail.kind, clearMainPaging])

  async function fetchMainPage(offset: number): Promise<TrackPage> {
    if (trackMode === 'liked' && !query.trim()) {
      const page = await spotify.getSavedTracksPage(PAGE, offset)
      return {
        items: page.items.map((s) => s.track).filter(Boolean),
        total: page.total,
        next: page.next
      }
    }
    if (query.trim()) {
      const res = await spotify.searchPage(query.trim(), 'track', PAGE, offset)
      const paging = res.tracks
      return {
        items: paging?.items ?? [],
        total: paging?.total ?? 0,
        next: paging?.next ?? null
      }
    }
    // top
    return spotify.getTopTracksPage(PAGE, offset)
  }

  const applyMainPage = useCallback(
    async (page: TrackPage, offset: number, replace: boolean, assumeLiked: boolean): Promise<void> => {
      const nextOffset = offset + page.items.length
      mainOffsetRef.current = nextOffset
      setMainOffset(nextOffset)
      setMainTotal(page.total)
      const done = !page.next || page.items.length === 0 || nextOffset >= page.total
      mainCompleteRef.current = done
      setMainComplete(done)

      if (replace) {
        setTracks(page.items)
        if (assumeLiked) {
          likedLibraryRef.current = page.items
          setLikedLibrary(page.items)
          syncLikedSession(page.items, done, page.total)
        }
        setLikedMap(await resolveLikedMap(page.items, assumeLiked))
      } else {
        setTracks((prev) => mergeTracks(prev, page.items))
        if (assumeLiked) {
          const merged = mergeTracks(likedLibraryRef.current, page.items)
          likedLibraryRef.current = merged
          setLikedLibrary(merged)
          syncLikedSession(merged, done, page.total)
        }
        const likes = await resolveLikedMap(page.items, assumeLiked)
        setLikedMap((prev) => ({ ...prev, ...likes }))
      }
    },
    []
  )

  const appendMainPage = useCallback(async (): Promise<void> => {
    if (loadingMoreRef.current || mainCompleteRef.current) return
    if (trackMode === 'liked' && query.trim()) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    const gen = fetchGen.current
    const offset = mainOffsetRef.current
    try {
      const page = await fetchMainPage(offset)
      if (gen !== fetchGen.current) return
      await applyMainPage(page, offset, false, trackMode === 'liked' && !query.trim())
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackMode, query, applyMainPage])

  const appendPlaylistPage = useCallback(async (): Promise<void> => {
    const playlistId = detailPlaylistIdRef.current
    if (!playlistId || loadingMoreRef.current || detailCompleteRef.current) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    const offset = detailOffsetRef.current
    try {
      const page = await spotify.getPlaylistTracksPage(playlistId, PAGE, offset)
      const nextOffset = offset + page.items.length
      detailOffsetRef.current = nextOffset
      setDetailOffset(nextOffset)
      setDetailTotal(page.total)
      const done = !page.next || page.items.length === 0 || nextOffset >= page.total
      detailCompleteRef.current = done
      setDetailComplete(done)
      setDetailTracks((prev) => mergeTracks(prev, page.items))
      const likes = await resolveLikedMap(page.items)
      setDetailLikedMap((prev) => ({ ...prev, ...likes }))
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [])

  const ensureFullLikedLibrary = useCallback(async (): Promise<Track[]> => {
    if (likedSession.complete && likedSession.tracks.length > 0) {
      likedLibraryRef.current = likedSession.tracks
      return likedSession.tracks
    }
    if (mainCompleteRef.current && likedLibraryRef.current.length > 0) {
      syncLikedSession(likedLibraryRef.current, true, likedLibraryRef.current.length)
      return likedLibraryRef.current
    }

    setSearchingLibrary(true)
    const gen = fetchGen.current
    try {
      // Resume from session cache instead of re-downloading from offset 0.
      let all = likedSession.tracks.length > 0 ? [...likedSession.tracks] : [...likedLibraryRef.current]
      let offset = all.length
      let total = likedSession.total > 0 ? likedSession.total : Infinity

      while (offset < total) {
        if (gen !== fetchGen.current) return likedLibraryRef.current
        const page = await spotify.getSavedTracksPage(PAGE, offset)
        total = page.total
        const tracks = page.items.map((s) => s.track).filter(Boolean)
        all = mergeTracks(all, tracks)
        offset = all.length
        likedLibraryRef.current = all
        setLikedLibrary(all)
        syncLikedSession(all, false, total)
        likesStore.markAll(
          tracks.map((t) => t.id).filter(Boolean),
          true
        )
        if (!page.next || page.items.length === 0) break
      }

      if (gen !== fetchGen.current) return likedLibraryRef.current

      syncLikedSession(all, true, total === Infinity ? all.length : total)
      likedLibraryRef.current = all
      setLikedLibrary(all)
      mainOffsetRef.current = all.length
      mainCompleteRef.current = true
      setMainOffset(all.length)
      setMainTotal(all.length)
      setMainComplete(true)
      const map: Record<string, boolean> = {}
      for (const t of all) {
        if (t.id) map[t.id] = true
      }
      setLikedMap(map)
      return all
    } finally {
      setSearchingLibrary(false)
    }
  }, [])

  async function loadTab(): Promise<void> {
    fetchGen.current += 1
    const gen = fetchGen.current
    setLoading(true)
    setListError(null)
    try {
      if (tab === 'tracks') {
        if (trackMode === 'liked' && query.trim()) {
          const library = await ensureFullLikedLibrary()
          if (gen !== fetchGen.current) return
          setTracks(library.filter((t) => matchesQuery(t, query)))
          mainCompleteRef.current = true
          setMainComplete(true)
        } else if (trackMode === 'liked' && likedSession.tracks.length > 0) {
          // Restore session cache (survives Top ↔ Liked switches)
          likedLibraryRef.current = likedSession.tracks
          setLikedLibrary(likedSession.tracks)
          setTracks(likedSession.tracks)
          mainOffsetRef.current = likedSession.tracks.length
          setMainOffset(likedSession.tracks.length)
          setMainTotal(likedSession.total || likedSession.tracks.length)
          mainCompleteRef.current = likedSession.complete
          setMainComplete(likedSession.complete)
          likesStore.markAll(
            likedSession.tracks.map((t) => t.id).filter(Boolean),
            true
          )
          if (!likedSession.complete) {
            // Continue paging in background if user scrolls
          }
        } else if (trackMode === 'liked' && likedLibraryRef.current.length > 0) {
          setTracks(likedLibraryRef.current)
          if (mainCompleteRef.current) setMainComplete(true)
        } else {
          const page = await fetchMainPage(0)
          if (gen !== fetchGen.current) return
          await applyMainPage(page, 0, true, trackMode === 'liked' && !query.trim())
        }
      } else if (tab === 'artists') {
        if (query.trim()) {
          const res = await spotify.searchPage(query.trim(), 'artist', PAGE, 0)
          if (gen !== fetchGen.current) return
          setArtists(res.artists?.items ?? [])
        } else {
          const items = await spotify.getTopArtists(PAGE)
          if (gen !== fetchGen.current) return
          setArtists(items)
        }
      } else if (query.trim()) {
        const res = await spotify.searchPage(query.trim(), 'playlist', PAGE, 0)
        if (gen !== fetchGen.current) return
        setPlaylists(res.playlists?.items ?? [])
      } else {
        const items = await spotify.getPlaylists(PAGE)
        if (gen !== fetchGen.current) return
        setPlaylists(items)
      }
    } catch (err) {
      if (gen === fetchGen.current) {
        setListError(err instanceof Error ? err.message : 'Failed to load')
      }
    } finally {
      // Always clear loading for this generation; a newer loadTab will set it true again
      if (gen === fetchGen.current) setLoading(false)
    }
  }

  // Keep liked browse list in sync when pages append
  useEffect(() => {
    if (tab !== 'tracks' || trackMode !== 'liked' || query.trim()) return
    if (likedLibrary.length > 0) setTracks(likedLibrary)
  }, [likedLibrary, tab, trackMode, query])

  useEffect(() => {
    const root = scrollRef.current
    const sentinel = sentinelRef.current
    if (!root || !sentinel) return
    if (!listHasMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting) || loadingMoreRef.current) return
        if (isPlaylistDetail) void appendPlaylistPage()
        else if (isTrackBrowse) void appendMainPage()
      },
      { root, rootMargin: '160px', threshold: 0 }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [
    listHasMore,
    isPlaylistDetail,
    isTrackBrowse,
    appendMainPage,
    appendPlaylistPage,
    tracks.length,
    detailTracks.length,
    detail.kind
  ])

  async function openArtist(artist: Artist): Promise<void> {
    setDetail({ kind: 'artist', artist })
    detailPlaylistIdRef.current = null
    detailCompleteRef.current = true
    setDetailComplete(true)
    setDetailTracks([])
  }

  async function openAlbum(album: Album): Promise<void> {
    setDetail({ kind: 'album', album })
    detailPlaylistIdRef.current = null
    detailCompleteRef.current = true
    setDetailComplete(true)
    setDetailTracks([])
  }

  async function openPlaylist(playlist: Playlist): Promise<void> {
    setDetail({ kind: 'playlist', playlist })
    detailPlaylistIdRef.current = playlist.id
    detailOffsetRef.current = 0
    detailCompleteRef.current = false
    setDetailOffset(0)
    setDetailTotal(0)
    setDetailComplete(false)
    setDetailTracks([])
    setLoading(true)
    try {
      const page = await spotify.getPlaylistTracksPage(playlist.id, PAGE, 0)
      const nextOffset = page.items.length
      detailOffsetRef.current = nextOffset
      setDetailOffset(nextOffset)
      setDetailTotal(page.total)
      const done = !page.next || page.items.length === 0 || nextOffset >= page.total
      detailCompleteRef.current = done
      setDetailComplete(done)
      setDetailTracks(page.items)
      setDetailLikedMap(await resolveLikedMap(page.items))
    } finally {
      setLoading(false)
    }
  }

  async function openQueue(): Promise<void> {
    setDetail({ kind: 'queue' })
    detailPlaylistIdRef.current = null
    detailCompleteRef.current = true
    setDetailComplete(true)
    const q = await spotify.getQueue()
    const next = q.queue ?? []
    setDetailTracks(next)
    setDetailLikedMap(await resolveLikedMap(next))
  }

  const searchPlaceholder = useMemo(() => {
    if (tab === 'tracks' && trackMode === 'liked') return 'Search liked songs…'
    return `Search ${tab}…`
  }, [tab, trackMode])

  const showSentinel =
    (detail.kind === 'none' && isTrackBrowse) || detail.kind === 'playlist'

  const statusLabel = useMemo(() => {
    if (loadingMore) return 'Loading more…'
    if (listHasMore) return 'Scroll for more'
    if (detail.kind === 'playlist' && detailComplete && detailTotal > 0) {
      return `${detailTotal} tracks`
    }
    if (trackMode === 'liked' && !query.trim() && mainComplete && mainTotal > 0) {
      return `${mainTotal} liked songs`
    }
    if (trackMode === 'top' && !query.trim() && mainComplete && mainTotal > 0) {
      return `${mainTotal} top tracks`
    }
    if (query.trim() && trackMode !== 'liked' && mainComplete && mainTotal > 0) {
      return `${Math.min(tracks.length, mainTotal)} of ${mainTotal}`
    }
    return null
  }, [
    loadingMore,
    listHasMore,
    detail.kind,
    detailComplete,
    detailTotal,
    trackMode,
    query,
    mainComplete,
    mainTotal,
    tracks.length
  ])

  const viewToggle = (
    <button
      type="button"
      className="icon-btn list-view-toggle"
      onClick={() => setCompact((c) => !c)}
      title={compact ? 'Normal view' : 'Compact view'}
    >
      {compact ? <IconViewNormal /> : <IconViewCompact />}
    </button>
  )

  const playAllButton = (items: Track[], contextUri?: string): ReactNode => (
    <button
      type="button"
      className="btn-play-all"
      disabled={items.length === 0 && !contextUri}
      title="Play all in order"
      onClick={() => {
        if (contextUri) void onPlayContext(contextUri)
        else void onPlayTracks(items.map((t) => t.uri))
      }}
    >
      <IconPlay />
      <span>Play</span>
    </button>
  )

  const renderTrackList = (items: Track[], likes: Record<string, boolean>, withSentinel = false): ReactNode => (
    <div className={`list ${compact ? 'list--compact' : ''}`}>
      {items.map((t) => (
        <TrackCard
          key={t.id + t.uri}
          track={t}
          compact={compact}
          initialLiked={Boolean(t.id && likes[t.id])}
          onPlay={() => void onPlayTrack(t.uri)}
        />
      ))}
      {items.length === 0 && !loading && !searchingLibrary && <div className="empty">No tracks</div>}
      {withSentinel && (
        <div ref={sentinelRef} className="list-sentinel">
          {statusLabel && <span>{statusLabel}</span>}
        </div>
      )}
    </div>
  )

  if (detail.kind === 'artist') {
    return (
      <ArtistDetail
        artist={detail.artist}
        compact={compact}
        onToggleCompact={() => setCompact((c) => !c)}
        onBack={() => {
          setDetail({ kind: 'none' })
          detailPlaylistIdRef.current = null
        }}
        onPlayTrack={(uri) => void onPlayTrack(uri)}
        onPlayTracks={(uris) => void onPlayTracks(uris)}
      />
    )
  }

  if (detail.kind === 'album') {
    return (
      <AlbumDetail
        album={detail.album}
        compact={compact}
        onToggleCompact={() => setCompact((c) => !c)}
        onBack={() => {
          setDetail({ kind: 'none' })
          detailPlaylistIdRef.current = null
        }}
        onPlayTrack={(uri) => void onPlayTrack(uri)}
        onPlayTracks={(uris) => void onPlayTracks(uris)}
        onPlayContext={(uri) => void onPlayContext(uri)}
      />
    )
  }

  if (detail.kind !== 'none') {
    const title = detail.kind === 'playlist' ? detail.playlist.name : 'Queue'
    const detailCount =
      detail.kind === 'playlist' && typeof detail.playlist.tracks?.total === 'number'
        ? detail.playlist.tracks.total
        : detailTracks.length
    const playlistUri = detail.kind === 'playlist' ? detail.playlist.uri : undefined

    return (
      <div className="glow-card">
        <div className="detail-header">
          <div className="detail-header__row">
            <button
              className="back-btn"
              onClick={() => {
                setDetail({ kind: 'none' })
                detailPlaylistIdRef.current = null
              }}
            >
              <IconBack /> Back
            </button>
            <div className="detail-header__actions">
              {playAllButton(detailTracks, playlistUri)}
              {viewToggle}
            </div>
          </div>
          <h3 className="detail-header__title">{title}</h3>
          {detailCount > 0 && (
            <p className="detail-header__meta">
              {detailCount} track{detailCount === 1 ? '' : 's'}
            </p>
          )}
        </div>
        <div className="scroll" ref={scrollRef}>
          {loading && detailTracks.length === 0 && <div className="empty">Loading…</div>}
          {!(loading && detailTracks.length === 0) &&
            renderTrackList(detailTracks, detailLikedMap, showSentinel)}
        </div>
      </div>
    )
  }

  return (
    <div className="glow-card">
      <div className="tabs tabs--compact">
        {(['tracks', 'artists', 'playlists'] as Tab[]).map((t) => (
          <button
            key={t}
            className={tab === t ? 'active' : ''}
            onClick={() => {
              setTab(t)
              setQuery('')
            }}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="list-toolbar">
        {tab === 'tracks' && (
          <div className="segment segment--inline">
            <button
              className={trackMode === 'liked' ? 'active' : ''}
              onClick={() => setTrackMode('liked')}
            >
              Liked
            </button>
            <button className={trackMode === 'top' ? 'active' : ''} onClick={() => setTrackMode('top')}>
              Top
            </button>
          </div>
        )}
        <input
          className="search search--compact"
          placeholder={searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {tab === 'tracks' && playAllButton(tracks)}
        {viewToggle}
      </div>

      <div className="scroll" ref={scrollRef}>
        {listError && (
          <div className="list-status" style={{ color: 'var(--danger)' }}>
            {listError}
          </div>
        )}
        {(loading || searchingLibrary) && tab === 'tracks' && tracks.length === 0 && (
          <div className="empty">{searchingLibrary ? 'Searching liked library…' : 'Loading…'}</div>
        )}
        {loading && tab === 'artists' && artists.length === 0 && <div className="empty">Loading…</div>}
        {loading && tab === 'playlists' && playlists.length === 0 && <div className="empty">Loading…</div>}
        {searchingLibrary && tracks.length > 0 && (
          <div className="list-status">Searching entire liked library…</div>
        )}
        {tab === 'tracks' &&
          !(loading && tracks.length === 0) &&
          renderTrackList(tracks, likedMap, showSentinel)}
        {tab === 'artists' && !loading && (
          <div className={`list ${compact ? 'list--compact' : ''}`}>
            {artists.map((a) => (
              <button
                key={a.id}
                className={`list-item ${compact ? 'list-item--compact' : ''}`}
                onClick={() => void openArtist(a)}
              >
                <img src={coverOf(a.images)} alt="" />
                <div className="list-item__meta">
                  <div className="list-item__title">{a.name}</div>
                  {!compact && <div className="list-item__sub">Artist</div>}
                </div>
              </button>
            ))}
            {artists.length === 0 && !listError && <div className="empty">No artists</div>}
          </div>
        )}
        {tab === 'playlists' && !loading && (
          <div className={`list ${compact ? 'list--compact' : ''}`}>
            {playlists.map((p) => (
              <button
                key={p.id}
                className={`list-item ${compact ? 'list-item--compact' : ''}`}
                onClick={() => void openPlaylist(p)}
              >
                <img src={coverOf(p.images)} alt="" />
                <div className="list-item__meta">
                  <div className="list-item__title">{p.name}</div>
                  <div className="list-item__sub">{playlistSubtitle(p)}</div>
                </div>
              </button>
            ))}
            {playlists.length === 0 && !listError && <div className="empty">No playlists</div>}
          </div>
        )}
      </div>
    </div>
  )
}
