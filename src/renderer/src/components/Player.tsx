import { useEffect, useRef, useState } from 'react'
import { coverOf, formatMs } from '../api/spotify'
import type { usePlayback } from '../hooks/usePlayback'
import type { Album, Artist } from '../types/spotify'
import {
  IconHeart,
  IconMic,
  IconNext,
  IconPause,
  IconPlay,
  IconPrev,
  IconQueue,
  IconRepeat,
  IconShuffle
} from './Icons'
import BeatVisualizer from './BeatVisualizer'
import RangeSlider from './RangeSlider'
import VolumeControl from './VolumeControl'
import './Player.css'

type PlaybackApi = ReturnType<typeof usePlayback>

interface Props {
  api: PlaybackApi
  onOpenLyrics: () => void
  onOpenQueue: () => void
  onOpenArtist: (artist: Artist) => void
  onOpenAlbum: (album: Album) => void
}

export default function Player({ api, onOpenLyrics, onOpenQueue, onOpenArtist, onOpenAlbum }: Props) {
  const { playback, progress, liked, playPause, next, previous, seek, toggleShuffle, cycleRepeat, setVolume, toggleLike } =
    api

  const track = playback?.item
  const hasTrack = Boolean(track)
  const isPlaying = Boolean(playback?.is_playing)
  const duration = track?.duration_ms ?? 0
  const cover = coverOf(track?.album?.images)
  const artistList = track?.artists ?? []
  const artistsLabel = artistList.map((a) => a.name).join(', ') || '—'
  const album = track?.album
  const albumName = album?.name ?? '—'
  const trackId = track?.id ?? track?.uri ?? ''
  const trackName = track?.name ?? 'Nothing playing'
  const deviceName = playback?.device?.name
  const repeatState = playback?.repeat_state ?? 'off'

  const [volume, setLocalVolume] = useState(playback?.device?.volume_percent ?? 70)
  const [prevVolume, setPrevVolume] = useState(70)
  const [titleOverflow, setTitleOverflow] = useState(false)
  const [scrubbing, setScrubbing] = useState(false)
  const [scrubMs, setScrubMs] = useState(0)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const seekDisplay = scrubbing ? scrubMs : progress

  useEffect(() => {
    const v = playback?.device?.volume_percent
    if (typeof v === 'number') setLocalVolume(v)
  }, [playback?.device?.volume_percent])

  useEffect(() => {
    setScrubbing(false)
  }, [trackId])

  useEffect(() => {
    const el = titleRef.current
    if (!el) {
      setTitleOverflow(false)
      return
    }
    setTitleOverflow(el.scrollWidth > el.clientWidth + 1)
  }, [trackName, trackId])

  const commitVolume = (v: number): void => {
    setLocalVolume(v)
    void setVolume(v)
  }

  const toggleMute = (): void => {
    if (volume > 0) {
      setPrevVolume(volume)
      commitVolume(0)
    } else {
      commitVolume(prevVolume || 50)
    }
  }

  return (
    <section className={`player ${!hasTrack ? 'player--empty' : ''} ${isPlaying ? 'player--playing' : ''}`}>
      {hasTrack && (
        <BeatVisualizer
          trackId={track?.id}
          previewUrl={track?.preview_url}
          progressMs={seekDisplay}
          durationMs={duration}
          active={isPlaying}
        />
      )}
      <div className="player__top">
        {album?.id ? (
          <button
            type="button"
            className={`player__cover player__cover--link ${isPlaying ? 'player__cover--playing' : ''}`}
            onClick={() => onOpenAlbum(album)}
            title={`Open ${albumName}`}
          >
            {cover ? (
              <>
                <div
                  className="player__cover-glow"
                  style={{ backgroundImage: `url(${cover})` }}
                  aria-hidden
                />
                <img key={trackId} className="player__art" src={cover} alt="" />
              </>
            ) : (
              <div className="player__art player__art--empty" />
            )}
            <span className="player__cover-hint" aria-hidden>
              Album
            </span>
          </button>
        ) : (
          <div className={`player__cover ${isPlaying ? 'player__cover--playing' : ''}`}>
            {cover ? (
              <>
                <div
                  className="player__cover-glow"
                  style={{ backgroundImage: `url(${cover})` }}
                  aria-hidden
                />
                <img key={trackId} className="player__art" src={cover} alt="" />
              </>
            ) : (
              <div className="player__art player__art--empty" />
            )}
          </div>
        )}

        <div className="player__meta">
          <div className="player__title-row">
            <div
              className={`player__title-wrap ${titleOverflow ? 'player__title-wrap--overflow' : ''}`}
              key={trackId}
            >
              <h2 ref={titleRef} className="player__title" title={trackName}>
                {trackName}
              </h2>
            </div>
            <button
              type="button"
              className={`icon-btn player__like ${liked ? 'active' : ''}`}
              onClick={() => void toggleLike()}
              title="Like"
              disabled={!hasTrack}
            >
              <IconHeart filled={liked} />
            </button>
          </div>

          <p className="player__artists" title={artistsLabel}>
            {!hasTrack ? (
              'Play something from your library'
            ) : artistList.length === 0 ? (
              '—'
            ) : (
              artistList.map((artist, i) => (
                <span key={artist.id || `${artist.name}-${i}`}>
                  {i > 0 ? ', ' : null}
                  {artist.id ? (
                    <button
                      type="button"
                      className="player__artist-link"
                      onClick={() => onOpenArtist(artist)}
                      title={`Open ${artist.name}`}
                    >
                      {artist.name}
                    </button>
                  ) : (
                    artist.name
                  )}
                </span>
              ))
            )}
          </p>

          {hasTrack &&
            (album?.id ? (
              <button
                type="button"
                className="player__album player__album--link"
                title={`Open ${albumName}`}
                onClick={() => onOpenAlbum(album)}
              >
                {albumName}
              </button>
            ) : (
              <span className="player__album" title={albumName}>
                {albumName}
              </span>
            ))}

          <div className="player__toolbar">
            <div className="player__actions">
              <button
                type="button"
                className="icon-btn"
                onClick={onOpenQueue}
                title="Queue"
                disabled={!hasTrack}
              >
                <IconQueue />
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={onOpenLyrics}
                title="Lyrics"
                disabled={!hasTrack}
              >
                <IconMic />
              </button>
              <VolumeControl
                volume={volume}
                onVolumeChange={setLocalVolume}
                onCommit={commitVolume}
                onMuteToggle={toggleMute}
                orientation="vertical"
              />
            </div>
            {deviceName && (
              <span className="player__device" title={deviceName}>
                {deviceName}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="player__seek">
        <span>{formatMs(seekDisplay)}</span>
        <RangeSlider
          min={0}
          max={duration || 1}
          value={Math.min(seekDisplay, duration || 1)}
          disabled={!hasTrack}
          onChange={(v) => {
            setScrubbing(true)
            setScrubMs(v)
          }}
          onCommit={(v) => {
            setScrubbing(false)
            setScrubMs(v)
            void seek(v)
          }}
        />
        <span>{formatMs(duration)}</span>
      </div>

      <div className="player__controls">
        <button
          type="button"
          className={`icon-btn ${playback?.shuffle_state ? 'active' : ''}`}
          onClick={() => void toggleShuffle()}
          title="Shuffle"
          disabled={!hasTrack}
        >
          <IconShuffle />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => void previous()}
          title="Previous"
          disabled={!hasTrack}
        >
          <IconPrev />
        </button>
        <button
          type="button"
          className="icon-btn primary"
          onClick={() => void playPause()}
          title="Play/Pause"
        >
          {isPlaying ? <IconPause /> : <IconPlay />}
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => void next()}
          title="Next"
          disabled={!hasTrack}
        >
          <IconNext />
        </button>
        <button
          type="button"
          className={`icon-btn ${repeatState !== 'off' ? 'active' : ''}`}
          onClick={() => void cycleRepeat()}
          title={`Repeat: ${repeatState}`}
          disabled={!hasTrack}
        >
          <IconRepeat mode={repeatState === 'off' ? 'context' : repeatState} />
        </button>
      </div>
    </section>
  )
}
