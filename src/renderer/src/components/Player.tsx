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
  IconShuffle
} from './Icons'
import './Player.css'

type PlaybackApi = ReturnType<typeof usePlayback>

interface Props {
  api: PlaybackApi
  onOpenLyrics: () => void
  onOpenQueue: () => void
}

export default function Player({ api, onOpenLyrics, onOpenQueue }: Props) {
  const { playback, progress, liked, playPause, next, previous, seek, toggleShuffle, cycleRepeat, setVolume, toggleLike } =
    api

  const track = playback?.item
  const duration = track?.duration_ms ?? 0
  const cover = coverOf(track?.album?.images)
  const artists = track?.artists?.map((a) => a.name).join(', ') ?? '—'

  return (
    <section className="player">
      <div className="player__art-wrap">
        {cover ? <img className="player__art" src={cover} alt="" /> : <div className="player__art player__art--empty" />}
        <div className="player__glow" style={{ backgroundImage: cover ? `url(${cover})` : undefined }} />
      </div>

      <div className="player__info">
        <div className="player__titles">
          <h2>{track?.name ?? 'Nothing playing'}</h2>
          <p>{artists}</p>
        </div>
        <button className={`icon-btn ${liked ? 'active' : ''}`} onClick={() => void toggleLike()} title="Like" disabled={!track}>
          <IconHeart filled={liked} />
        </button>
      </div>

      <div className="player__seek">
        <input
          type="range"
          min={0}
          max={duration || 1}
          value={Math.min(progress, duration || 1)}
          onChange={(e) => void seek(Number(e.target.value))}
          disabled={!track}
        />
        <div className="player__times">
          <span>{formatMs(progress)}</span>
          <span>{formatMs(duration)}</span>
        </div>
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

      <div className="player__extra">
        <button className="icon-btn" onClick={onOpenQueue} title="Queue">
          <IconQueue />
        </button>
        <input
          className="player__volume"
          type="range"
          min={0}
          max={100}
          defaultValue={playback?.device?.volume_percent ?? 70}
          onMouseUp={(e) => void setVolume(Number((e.target as HTMLInputElement).value))}
          onTouchEnd={(e) => void setVolume(Number((e.target as HTMLInputElement).value))}
          title="Volume"
        />
        <button className="icon-btn" onClick={onOpenLyrics} title="Lyrics" disabled={!track}>
          <IconMic />
        </button>
      </div>
    </section>
  )
}
