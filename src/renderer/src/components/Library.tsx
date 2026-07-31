import { useEffect, useState } from 'react'
import { coverOf, spotify } from '../api/spotify'
import type { Artist, Playlist, Track } from '../types/spotify'
import { IconBack } from './Icons'

type Tab = 'tracks' | 'artists' | 'playlists'
type TrackMode = 'liked' | 'top'
type Detail =
  | { kind: 'none' }
  | { kind: 'artist'; artist: Artist }
  | { kind: 'playlist'; playlist: Playlist }
  | { kind: 'queue' }

interface Props {
  onPlayTrack: (uri: string, contextUri?: string) => Promise<void>
  queueOpenSignal: number
}

export default function Library({ onPlayTrack, queueOpenSignal }: Props) {
  const [tab, setTab] = useState<Tab>('tracks')
  const [trackMode, setTrackMode] = useState<TrackMode>('liked')
  const [query, setQuery] = useState('')
  const [tracks, setTracks] = useState<Track[]>([])
  const [artists, setArtists] = useState<Artist[]>([])
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [detail, setDetail] = useState<Detail>({ kind: 'none' })
  const [detailTracks, setDetailTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (queueOpenSignal > 0) {
      void openQueue()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueOpenSignal])

  useEffect(() => {
    if (detail.kind !== 'none') return
    const handle = window.setTimeout(() => {
      void loadTab()
    }, query ? 300 : 0)
    return () => window.clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, trackMode, query, detail.kind])

  async function loadTab(): Promise<void> {
    setLoading(true)
    try {
      if (tab === 'tracks') {
        if (query.trim()) {
          const res = await spotify.search(query.trim(), 'track')
          setTracks(res.tracks?.items ?? [])
        } else if (trackMode === 'liked') {
          const saved = await spotify.getSavedTracks(30)
          setTracks(saved.map((s) => s.track))
        } else {
          setTracks(await spotify.getTopTracks(30))
        }
      } else if (tab === 'artists') {
        if (query.trim()) {
          const res = await spotify.search(query.trim(), 'artist')
          setArtists(res.artists?.items ?? [])
        } else {
          setArtists(await spotify.getTopArtists(30))
        }
      } else {
        if (query.trim()) {
          const res = await spotify.search(query.trim(), 'playlist')
          setPlaylists(res.playlists?.items ?? [])
        } else {
          setPlaylists(await spotify.getPlaylists(30))
        }
      }
    } finally {
      setLoading(false)
    }
  }

  async function openArtist(artist: Artist): Promise<void> {
    setDetail({ kind: 'artist', artist })
    setDetailTracks(await spotify.getArtistTopTracks(artist.id))
  }

  async function openPlaylist(playlist: Playlist): Promise<void> {
    setDetail({ kind: 'playlist', playlist })
    setDetailTracks(await spotify.getPlaylistTracks(playlist.id))
  }

  async function openQueue(): Promise<void> {
    setDetail({ kind: 'queue' })
    const q = await spotify.getQueue()
    setDetailTracks(q.queue ?? [])
  }

  if (detail.kind !== 'none') {
    const title =
      detail.kind === 'artist'
        ? detail.artist.name
        : detail.kind === 'playlist'
          ? detail.playlist.name
          : 'Queue'

    return (
      <div className="glow-card">
        <div className="scroll">
          <button className="back-btn" onClick={() => setDetail({ kind: 'none' })}>
            <IconBack /> Back
          </button>
          <h3 style={{ marginBottom: 10, fontFamily: 'var(--display)' }}>{title}</h3>
          <div className="list">
            {detailTracks.map((t) => (
              <button key={t.id + t.uri} className="list-item" onClick={() => void onPlayTrack(t.uri)}>
                <img src={coverOf(t.album?.images)} alt="" />
                <div className="list-item__meta">
                  <div className="list-item__title">{t.name}</div>
                  <div className="list-item__sub">{t.artists.map((a) => a.name).join(', ')}</div>
                </div>
              </button>
            ))}
            {detailTracks.length === 0 && <div className="empty">No tracks</div>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="glow-card">
      <div className="tabs">
        {(['tracks', 'artists', 'playlists'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => { setTab(t); setQuery('') }}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'tracks' && !query && (
        <div className="segment">
          <button className={trackMode === 'liked' ? 'active' : ''} onClick={() => setTrackMode('liked')}>
            Liked
          </button>
          <button className={trackMode === 'top' ? 'active' : ''} onClick={() => setTrackMode('top')}>
            Top
          </button>
        </div>
      )}

      <input
        className="search"
        placeholder={`Search ${tab}…`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="scroll">
        {loading && <div className="empty">Loading…</div>}
        {!loading && tab === 'tracks' && (
          <div className="list">
            {tracks.map((t) => (
              <button key={t.id} className="list-item" onClick={() => void onPlayTrack(t.uri)}>
                <img src={coverOf(t.album?.images)} alt="" />
                <div className="list-item__meta">
                  <div className="list-item__title">{t.name}</div>
                  <div className="list-item__sub">{t.artists.map((a) => a.name).join(', ')}</div>
                </div>
              </button>
            ))}
          </div>
        )}
        {!loading && tab === 'artists' && (
          <div className="list">
            {artists.map((a) => (
              <button key={a.id} className="list-item" onClick={() => void openArtist(a)}>
                <img src={coverOf(a.images)} alt="" />
                <div className="list-item__meta">
                  <div className="list-item__title">{a.name}</div>
                  <div className="list-item__sub">Artist</div>
                </div>
              </button>
            ))}
          </div>
        )}
        {!loading && tab === 'playlists' && (
          <div className="list">
            {playlists.map((p) => (
              <button key={p.id} className="list-item" onClick={() => void openPlaylist(p)}>
                <img src={coverOf(p.images)} alt="" />
                <div className="list-item__meta">
                  <div className="list-item__title">{p.name}</div>
                  <div className="list-item__sub">{p.owner?.display_name ?? 'Playlist'}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
