import { useEffect, useState } from 'react'
import { coverOf, formatMs } from '../api/spotify'
import type { usePlayback } from '../hooks/usePlayback'
import {
  IconHeart,
  IconMic,
  IconNext,
  IconPause,
  IconPlay,
  IconPrev,
  IconQueue,
  IconRepeat,
  IconShuffle,
  IconVolume
} from './Icons'
import RangeSlider from './RangeSlider'
import './Player.css'

type PlaybackApi = ReturnType<typeof usePlayback>

interface Props {
  api: PlaybackApi
  onOpenLyrics: () => void
  onOpenQueue: () => void
}

function volumeLevel(v: number): 'mute' | 'low' | 'mid' | 'high' {
  if (v <= 0) return 'mute'
  if (v <= 33) return 'low'
  if (v <= 66) return 'mid'
  return 'high'
}

export default function Player({ api, onOpenLyrics, onOpenQueue }: Props) {
  const { playback, progress, liked, playPause, next, previous, seek, toggleShuffle, cycleRepeat, setVolume, toggleLike } =
    api

  const track = playback?.item
  const duration = track?.duration_ms ?? 0
  const cover = coverOf(track?.album?.images)
  const artists = track?.artists?.map((a) => a.name).join(', ') ?? '—'
  const album = track?.album?.name ?? '—'

  const [volume, setLocalVolume] = useState(playback?.device?.volume_percent ?? 70)
  const [prevVolume, setPrevVolume] = useState(70)
  const [volumeOpen, setVolumeOpen] = useState(false)

  useEffect(() => {
    const v = playback?.device?.volume_percent
    if (typeof v === 'number') setLocalVolume(v)
  }, [playback?.device?.volume_percent])

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
    <section className="player">
      <div className="player__top">
        <div className="player__cover">
          {cover ? (
            <>
              <div
                className="player__cover-glow"
                style={{ backgroundImage: `url(${cover})` }}
                aria-hidden
              />
              <img className="player__art" src={cover} alt="" />
            </>
          ) : (
            <div className="player__art player__art--empty" />
          )}
        </div>

        <div className="player__titles">
          <h2 title={track?.name}>{track?.name ?? 'Nothing playing'}</h2>
          <p title={artists}>{artists}</p>
          <span className="player__album" title={album}>
            {album}
          </span>
        </div>

        <div className="player__side">
          <button className="icon-btn" onClick={onOpenQueue} title="Queue">
            <IconQueue />
          </button>
          <button
            className={`icon-btn ${liked ? 'active' : ''}`}
            onClick={() => void toggleLike()}
            title="Like"
            disabled={!track}
          >
            <IconHeart filled={liked} />
          </button>
          <button className="icon-btn" onClick={onOpenLyrics} title="Lyrics" disabled={!track}>
            <IconMic />
          </button>
          <div
            className={`volume ${volumeOpen ? 'volume--open' : ''}`}
            onMouseEnter={() => setVolumeOpen(true)}
            onMouseLeave={() => setVolumeOpen(false)}
          >
            <div className="volume__popup volume__popup--vertical" aria-hidden={!volumeOpen}>
              <RangeSlider
                className="volume__slider"
                orient="vertical"
                min={0}
                max={100}
                value={volume}
                title="Volume"
                onChange={setLocalVolume}
                onCommit={commitVolume}
              />
            </div>
            <button className="icon-btn" onClick={toggleMute} title="Volume">
              <IconVolume level={volumeLevel(volume)} />
            </button>
          </div>
        </div>
      </div>

      <div className="player__seek">
        <span>{formatMs(progress)}</span>
        <RangeSlider
          min={0}
          max={duration || 1}
          value={Math.min(progress, duration || 1)}
          disabled={!track}
          onChange={(v) => void seek(v)}
        />
        <span>{formatMs(duration)}</span>
      </div>

      <div className="player__controls">
        <button
          className={`icon-btn ${playback?.shuffle_state ? 'active' : ''}`}
          onClick={() => void toggleShuffle()}
          title="Shuffle"
        >
          <IconShuffle />
        </button>
        <button className="icon-btn" onClick={() => void previous()} title="Previous">
          <IconPrev />
        </button>
        <button className="icon-btn primary" onClick={() => void playPause()} title="Play/Pause">
          {playback?.is_playing ? <IconPause /> : <IconPlay />}
        </button>
        <button className="icon-btn" onClick={() => void next()} title="Next">
          <IconNext />
        </button>
        <button
          className={`icon-btn ${playback?.repeat_state && playback.repeat_state !== 'off' ? 'active' : ''}`}
          onClick={() => void cycleRepeat()}
          title={`Repeat: ${playback?.repeat_state ?? 'off'}`}
        >
          <IconRepeat />
        </button>
      </div>
    </section>
  )
}
