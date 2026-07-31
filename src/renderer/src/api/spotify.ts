import type {
  Album,
  Artist,
  Device,
  Paging,
  PlaybackState,
  Playlist,
  QueueResponse,
  SavedTrack,
  SearchResponse,
  Track
} from '../types/spotify'

const BASE = 'https://api.spotify.com/v1'

async function token(): Promise<string> {
  const t = await window.spotiffy.auth.getAccessToken()
  if (!t) throw new Error('Not authenticated')
  return t
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  allowEmpty = false,
  retry = 0
): Promise<T | null> {
  const accessToken = await token()
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers ?? {})
    }
  })

  if (response.status === 204 || (allowEmpty && response.status === 200 && response.headers.get('content-length') === '0')) {
    return null
  }

  if (response.status === 429 && retry < 2) {
    const retryAfter = Number(response.headers.get('Retry-After') || '2')
    const waitMs = Math.min(15_000, Math.max(1, retryAfter) * 1000)
    await new Promise((r) => setTimeout(r, waitMs))
    return request<T>(path, options, allowEmpty, retry + 1)
  }

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Spotify API error ${response.status}`)
  }

  if (response.status === 204) return null

  const text = await response.text()
  if (!text) return null
  return JSON.parse(text) as T
}

export const spotify = {
  async getPlayback(): Promise<PlaybackState | null> {
    return request<PlaybackState>('/me/player', {}, true)
  },

  async getDevices(): Promise<Device[]> {
    const data = await request<{ devices: Device[] }>('/me/player/devices')
    return data?.devices ?? []
  },

  async transferPlayback(deviceId: string, play = true): Promise<void> {
    await request('/me/player', {
      method: 'PUT',
      body: JSON.stringify({ device_ids: [deviceId], play })
    })
  },

  async ensureDevice(): Promise<boolean> {
    const devices = await this.getDevices()
    if (devices.length === 0) return false
    const active = devices.find((d) => d.is_active)
    if (!active) {
      await this.transferPlayback(devices[0].id, true)
    }
    return true
  },

  async play(body?: object): Promise<void> {
    await request('/me/player/play', {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined
    })
  },

  async pause(): Promise<void> {
    await request('/me/player/pause', { method: 'PUT' })
  },

  async next(): Promise<void> {
    await request('/me/player/next', { method: 'POST' })
  },

  async previous(): Promise<void> {
    await request('/me/player/previous', { method: 'POST' })
  },

  async seek(positionMs: number): Promise<void> {
    await request(`/me/player/seek?position_ms=${positionMs}`, { method: 'PUT' })
  },

  async setVolume(percent: number): Promise<void> {
    await request(`/me/player/volume?volume_percent=${percent}`, { method: 'PUT' })
  },

  async setShuffle(state: boolean): Promise<void> {
    await request(`/me/player/shuffle?state=${state}`, { method: 'PUT' })
  },

  async setRepeat(state: 'off' | 'track' | 'context'): Promise<void> {
    await request(`/me/player/repeat?state=${state}`, { method: 'PUT' })
  },

  async getQueue(): Promise<QueueResponse> {
    return (await request<QueueResponse>('/me/player/queue')) ?? {
      currently_playing: null,
      queue: []
    }
  },

  async addToQueue(uri: string): Promise<void> {
    await request(`/me/player/queue?uri=${encodeURIComponent(uri)}`, { method: 'POST' })
  },

  async getSavedTracks(limit = 50, offset = 0): Promise<SavedTrack[]> {
    const page = await this.getSavedTracksPage(limit, offset)
    return page.items
  },

  async getSavedTracksPage(
    limit = 50,
    offset = 0
  ): Promise<{ items: SavedTrack[]; total: number; next: string | null }> {
    const data = await request<Paging<SavedTrack>>(
      `/me/tracks?limit=${Math.min(limit, 50)}&offset=${offset}`
    )
    return {
      items: data?.items ?? [],
      total: data?.total ?? 0,
      next: data?.next ?? null
    }
  },

  /** Fetch every liked track (50 per request). Optional per-page callback for progressive UI. */
  async getAllSavedTracks(
    onPage?: (tracks: Track[], loaded: number, total: number) => void
  ): Promise<Track[]> {
    const all: Track[] = []
    let offset = 0
    let total = Infinity

    while (offset < total) {
      const page = await this.getSavedTracksPage(50, offset)
      total = page.total
      const tracks = page.items.map((s) => s.track).filter(Boolean)
      all.push(...tracks)
      offset += page.items.length
      onPage?.(tracks, all.length, total)
      if (!page.next || page.items.length === 0) break
    }

    return all
  },

  async getTopTracks(limit = 20, offset = 0): Promise<Track[]> {
    const page = await this.getTopTracksPage(limit, offset)
    return page.items
  },

  async getTopTracksPage(
    limit = 50,
    offset = 0
  ): Promise<{ items: Track[]; total: number; next: string | null }> {
    const data = await request<Paging<Track>>(
      `/me/top/tracks?limit=${Math.min(limit, 50)}&offset=${offset}`
    )
    return {
      items: data?.items ?? [],
      total: data?.total ?? 0,
      next: data?.next ?? null
    }
  },

  async getTopArtists(limit = 20, offset = 0): Promise<Artist[]> {
    const data = await request<Paging<Artist>>(
      `/me/top/artists?limit=${Math.min(limit, 50)}&offset=${offset}`
    )
    return data?.items ?? []
  },

  async getPlaylists(limit = 20, offset = 0): Promise<Playlist[]> {
    const data = await request<Paging<Playlist>>(
      `/me/playlists?limit=${Math.min(limit, 50)}&offset=${offset}`
    )
    return data?.items ?? []
  },

  async search(q: string, type: 'track' | 'artist' | 'playlist'): Promise<SearchResponse> {
    return this.searchPage(q, type, 20, 0)
  },

  async searchPage(
    q: string,
    type: 'track' | 'artist' | 'playlist',
    limit = 20,
    offset = 0
  ): Promise<SearchResponse> {
    return (
      (await request<SearchResponse>(
        `/search?offset=${offset}&limit=${Math.min(limit, 50)}&type=${type}&q=${encodeURIComponent(q)}`
      )) ?? {}
    )
  },

  async getTrack(id: string): Promise<Track | null> {
    return request<Track>(`/tracks/${id}`)
  },

  async getArtist(id: string): Promise<Artist> {
    const data = await request<Artist>(`/artists/${id}`)
    if (!data) throw new Error('Artist not found')
    return data
  },

  async getArtistTopTracks(id: string, market = 'TR'): Promise<Track[]> {
    const data = await request<{ tracks: Track[] }>(
      `/artists/${id}/top-tracks?market=${encodeURIComponent(market)}`
    )
    return data?.tracks ?? []
  },

  async getArtistAlbums(id: string, limit = 20, offset = 0): Promise<Album[]> {
    const page = await this.getArtistAlbumsPage(id, limit, offset)
    return page.items
  },

  async getArtistAlbumsPage(
    id: string,
    limit = 50,
    offset = 0
  ): Promise<{ items: Album[]; total: number; next: string | null }> {
    const data = await request<Paging<Album>>(
      `/artists/${id}/albums?limit=${Math.min(limit, 50)}&offset=${offset}&include_groups=album,single`
    )
    return {
      items: data?.items ?? [],
      total: data?.total ?? 0,
      next: data?.next ?? null
    }
  },

  /** Unique tracks across the artist's albums & singles (can take a few requests). */
  async getArtistAllTracks(
    id: string,
    onProgress?: (loadedAlbums: number, totalAlbums: number) => void
  ): Promise<Track[]> {
    const albums: Album[] = []
    let offset = 0
    let total = Infinity
    while (offset < total) {
      const page = await this.getArtistAlbumsPage(id, 50, offset)
      total = page.total
      albums.push(...page.items)
      offset += page.items.length
      if (!page.next || page.items.length === 0) break
    }

    // Dedupe album groups (same album can appear twice for different markets)
    const uniqueAlbums: Album[] = []
    const seenAlbum = new Set<string>()
    for (const a of albums) {
      if (!a.id || seenAlbum.has(a.id)) continue
      seenAlbum.add(a.id)
      uniqueAlbums.push(a)
    }

    const tracks: Track[] = []
    const seenTrack = new Set<string>()
    for (let i = 0; i < uniqueAlbums.length; i++) {
      onProgress?.(i + 1, uniqueAlbums.length)
      const albumTracks = await this.getAlbumTracks(uniqueAlbums[i].id)
      for (const t of albumTracks) {
        if (!t.id || seenTrack.has(t.id)) continue
        seenTrack.add(t.id)
        tracks.push(t)
      }
    }
    return tracks
  },

  async getPlaylistTracks(id: string, limit = 50, offset = 0): Promise<Track[]> {
    const page = await this.getPlaylistTracksPage(id, limit, offset)
    return page.items
  },

  async getPlaylistTracksPage(
    id: string,
    limit = 50,
    offset = 0
  ): Promise<{ items: Track[]; total: number; next: string | null }> {
    const data = await request<Paging<{ track: Track | null }>>(
      `/playlists/${id}/tracks?limit=${Math.min(limit, 50)}&offset=${offset}`
    )
    const items = (data?.items ?? []).map((i) => i.track).filter(Boolean) as Track[]
    return {
      items,
      total: data?.total ?? items.length,
      next: data?.next ?? null
    }
  },

  async getAlbum(id: string): Promise<Album | null> {
    return request<Album>(`/albums/${id}`)
  },

  async getAlbumTracks(id: string): Promise<Track[]> {
    const album = await this.getAlbum(id)
    if (!album) return []

    const items: Track[] = []
    let offset = 0
    for (;;) {
      const page = await request<Paging<Track>>(
        `/albums/${id}/tracks?limit=50&offset=${offset}`
      )
      const batch = page?.items ?? []
      for (const t of batch) {
        items.push({ ...t, album: t.album ?? album })
      }
      if (!page?.next || batch.length === 0) break
      offset += batch.length
    }
    return items
  },

  async checkSaved(ids: string[]): Promise<boolean[]> {
    if (ids.length === 0) return []
    return (
      (await request<boolean[]>(`/me/tracks/contains?ids=${ids.join(',')}`)) ?? []
    )
  },

  async saveTracks(ids: string[]): Promise<void> {
    await request(`/me/tracks?ids=${ids.join(',')}`, { method: 'PUT' })
  },

  async removeTracks(ids: string[]): Promise<void> {
    await request(`/me/tracks?ids=${ids.join(',')}`, { method: 'DELETE' })
  }
}

export function formatMs(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function coverOf(
  images?: { url: string }[] | null,
  fallback = ''
): string {
  return images?.[0]?.url || fallback
}
