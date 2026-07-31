import { useEffect, useState } from 'react'
import { coverOf, formatMs } from '../api/spotify'
import type { usePlayback } from '../hooks/usePlayback'
import {
  IconExpand,
  IconHeart,
  IconNext,
  IconPause,
  IconPlay,
  IconPrev,
  IconRepeat,
  IconShuffle
} from './Icons'
import RangeSlider from './RangeSlider'
import VolumeControl from './VolumeControl'
import './Player.css'

type PlaybackApi = ReturnType<typeof usePlayback>

interface Props {
  api: PlaybackApi
  onExpand: () => void
}

export default function MiniPlayer({ api, onExpand }: Props) {
  const {
    playback,
    progress,
    liked,
    playPause,
    next,
    previous,
    seek,
    toggleShuffle,
    cycleRepeat,
    setVolume,
    toggleLike
  } = api

  const track = playback?.item
  const duration = track?.duration_ms ?? 0
  const cover = coverOf(track?.album?.images)
  const artists = track?.artists?.map((a) => a.name).join(', ') ?? '—'

  const [volume, setLocalVolume] = useState(playback?.device?.volume_percent ?? 70)
  const [prevVolume, setPrevVolume] = useState(70)
  const [scrubbing, setScrubbing] = useState(false)
  const [scrubMs, setScrubMs] = useState(0)
  const trackId = track?.id ?? track?.uri ?? ''
  const seekDisplay = scrubbing ? scrubMs : progress

  useEffect(() => {
    const v = playback?.device?.volume_percent
    if (typeof v === 'number') setLocalVolume(v)
  }, [playback?.device?.volume_percent])

  useEffect(() => {
    setScrubbing(false)
  }, [trackId])

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
    <div className="mini-shell">
      <button className="mini-shell__expand icon-btn" onClick={onExpand} title="Expand">
        <IconExpand />
      </button>

      {cover ? (
        <img className="mini-shell__art" src={cover} alt="" width={78} height={78} />
      ) : (
        <div className="mini-shell__art mini-shell__art--empty" />
      )}

      <div className="mini-shell__body">
        <div className="mini-shell__titles">
          <div className="list-item__title">{track?.name ?? 'Nothing playing'}</div>
          <div className="list-item__sub">{artists}</div>
        </div>

        <div className="mini-shell__seek">
          <span>{formatMs(seekDisplay)}</span>
          <RangeSlider
            min={0}
            max={duration || 1}
            value={Math.min(seekDisplay, duration || 1)}
            disabled={!track}
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

        <div className="mini-shell__controls">
          <VolumeControl
            volume={volume}
            onVolumeChange={setLocalVolume}
            onCommit={commitVolume}
            onMuteToggle={toggleMute}
            orientation="horizontal"
          />

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
            className={`icon-btn ${liked ? 'active' : ''}`}
            onClick={() => void toggleLike()}
            title="Like"
            disabled={!track}
          >
            <IconHeart filled={liked} />
          </button>
          <button
            className={`icon-btn ${playback?.repeat_state && playback.repeat_state !== 'off' ? 'active' : ''}`}
            onClick={() => void cycleRepeat()}
            title={`Repeat: ${playback?.repeat_state ?? 'off'}`}
          >
            <IconRepeat
              mode={
                playback?.repeat_state === 'track' || playback?.repeat_state === 'context'
                  ? playback.repeat_state
                  : 'context'
              }
            />
          </button>
        </div>
      </div>
    </div>
  )
}
