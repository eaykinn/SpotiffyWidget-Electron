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
  allowEmpty = false
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

  async getSavedTracks(limit = 20): Promise<SavedTrack[]> {
    const data = await request<Paging<SavedTrack>>(`/me/tracks?limit=${limit}`)
    return data?.items ?? []
  },

  async getTopTracks(limit = 20): Promise<Track[]> {
    const data = await request<Paging<Track>>(`/me/top/tracks?limit=${limit}`)
    return data?.items ?? []
  },

  async getTopArtists(limit = 20): Promise<Artist[]> {
    const data = await request<Paging<Artist>>(`/me/top/artists?limit=${limit}`)
    return data?.items ?? []
  },

  async getPlaylists(limit = 20): Promise<Playlist[]> {
    const data = await request<Paging<Playlist>>(`/me/playlists?limit=${limit}`)
    return data?.items ?? []
  },

  async search(q: string, type: 'track' | 'artist' | 'playlist'): Promise<SearchResponse> {
    return (
      (await request<SearchResponse>(
        `/search?offset=0&limit=20&type=${type}&q=${encodeURIComponent(q)}`
      )) ?? {}
    )
  },

  async getArtist(id: string): Promise<Artist> {
    const data = await request<Artist>(`/artists/${id}`)
    if (!data) throw new Error('Artist not found')
    return data
  },

  async getArtistTopTracks(id: string): Promise<Track[]> {
    const data = await request<{ tracks: Track[] }>(`/artists/${id}/top-tracks?market=US`)
    return data?.tracks ?? []
  },

  async getArtistAlbums(id: string): Promise<Album[]> {
    const data = await request<Paging<Album>>(`/artists/${id}/albums?limit=20&include_groups=album,single`)
    return data?.items ?? []
  },

  async getPlaylistTracks(id: string, limit = 50): Promise<Track[]> {
    const data = await request<Paging<{ track: Track | null }>>(
      `/playlists/${id}/tracks?limit=${limit}`
    )
    return (data?.items ?? []).map((i) => i.track).filter(Boolean) as Track[]
  },

  async getAlbumTracks(id: string): Promise<Track[]> {
    const album = await request<Album & { tracks: Paging<Track> }>(`/albums/${id}`)
    const items = album?.tracks?.items ?? []
    // Album track objects may omit album — attach parent album for cover
    return items.map((t) => ({ ...t, album: t.album ?? album! }))
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
