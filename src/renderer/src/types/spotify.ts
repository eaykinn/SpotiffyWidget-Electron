export interface SpotifyImage {
  url: string
  height?: number
  width?: number
}

export interface Artist {
  id: string
  name: string
  uri: string
  images?: SpotifyImage[]
  followers?: { total: number }
  genres?: string[]
}

export interface Album {
  id: string
  name: string
  uri: string
  images: SpotifyImage[]
  artists: Artist[]
}

export interface Track {
  id: string
  name: string
  uri: string
  duration_ms: number
  artists: Artist[]
  album: Album
}

export interface Playlist {
  id: string
  name: string
  uri: string
  images: SpotifyImage[]
  owner?: { display_name?: string }
  tracks?: { total: number }
}

export interface Device {
  id: string
  is_active: boolean
  name: string
  type: string
  volume_percent: number | null
}

export interface PlaybackState {
  is_playing: boolean
  progress_ms: number
  shuffle_state: boolean
  repeat_state: 'off' | 'track' | 'context'
  device?: Device
  item: Track | null
  context?: { type: string; uri: string } | null
}

export interface Paging<T> {
  items: T[]
  total: number
  next: string | null
  limit: number
  offset: number
}

export interface SavedTrack {
  added_at: string
  track: Track
}

export interface QueueResponse {
  currently_playing: Track | null
  queue: Track[]
}

export interface SearchResponse {
  tracks?: Paging<Track>
  artists?: Paging<Artist>
  playlists?: Paging<Playlist>
}
