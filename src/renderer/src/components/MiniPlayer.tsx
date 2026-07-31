import { coverOf } from '../api/spotify'
import type { usePlayback } from '../hooks/usePlayback'
import { IconExpand, IconNext, IconPause, IconPlay, IconPrev } from './Icons'

type PlaybackApi = ReturnType<typeof usePlayback>

interface Props {
  api: PlaybackApi
  onExpand: () => void
}

export default function MiniPlayer({ api, onExpand }: Props) {
  const { playback, playPause, next, previous } = api
  const track = playback?.item
  const cover = coverOf(track?.album?.images)
  const artists = track?.artists?.map((a) => a.name).join(', ') ?? '—'

  return (
    <div className="mini-shell">
      {cover ? (
        <img src={cover} alt="" width={72} height={72} style={{ borderRadius: 10, objectFit: 'cover' }} />
      ) : (
        <div style={{ width: 72, height: 72, borderRadius: 10, background: 'var(--surface)' }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="list-item__title">{track?.name ?? 'Nothing playing'}</div>
        <div className="list-item__sub">{artists}</div>
        <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
          <button className="icon-btn" onClick={() => void previous()}>
            <IconPrev />
          </button>
          <button className="icon-btn primary" onClick={() => void playPause()}>
            {playback?.is_playing ? <IconPause /> : <IconPlay />}
          </button>
          <button className="icon-btn" onClick={() => void next()}>
            <IconNext />
          </button>
        </div>
      </div>
      <button className="icon-btn" onClick={onExpand} title="Expand">
        <IconExpand />
      </button>
    </div>
  )
}
