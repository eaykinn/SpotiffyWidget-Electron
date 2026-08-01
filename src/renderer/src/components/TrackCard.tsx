import { useState, type MouseEvent } from 'react'
import { coverOf, formatMs, spotify } from '../api/spotify'
import { formatAddedAt } from '../lib/trackSort'
import { useTrackLiked } from '../likes/useTrackLiked'
import type { Track } from '../types/spotify'
import { IconAddQueue, IconHeart } from './Icons'

interface Props {
  track: Track
  initialLiked?: boolean
  compact?: boolean
  onPlay: () => void
}

export default function TrackCard({ track, initialLiked = false, compact = false, onPlay }: Props) {
  const { liked, toggle } = useTrackLiked(track.id, initialLiked)
  const [queued, setQueued] = useState(false)
  const [busy, setBusy] = useState(false)

  const artists = track.artists?.map((a) => a.name).join(', ') ?? '—'
  const album = track.album?.name ?? '—'
  const cover = coverOf(track.album?.images)
  const duration = formatMs(track.duration_ms ?? 0)
  const added = formatAddedAt(track.added_at)

  const toggleLike = async (e: MouseEvent): Promise<void> => {
    e.stopPropagation()
    if (!track.id || busy) return
    setBusy(true)
    try {
      await toggle()
    } finally {
      setBusy(false)
    }
  }

  const addQueue = async (e: MouseEvent): Promise<void> => {
    e.stopPropagation()
    if (!track.uri || busy) return
    setBusy(true)
    try {
      await spotify.ensureDevice()
      await spotify.addToQueue(track.uri)
      setQueued(true)
      window.setTimeout(() => setQueued(false), 1500)
    } catch {
      // ignore
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`track-card ${compact ? 'track-card--compact' : ''}`}>
      <button type="button" className="track-card__main" onClick={onPlay} title="Play">
        {cover ? (
          <img className="track-card__art" src={cover} alt="" />
        ) : (
          <div className="track-card__art track-card__art--empty" />
        )}
        <div className="track-card__meta">
          <div className="track-card__title">{track.name}</div>
          <div className="track-card__sub">{artists}</div>
          {!compact && <div className="track-card__sub">{album}</div>}
          <div className="track-card__duration">
            <span>{duration}</span>
            {added && (
              <>
                <span className="track-card__meta-sep" aria-hidden>
                  ·
                </span>
                <span className="track-card__added" title={`Added ${added}`}>
                  {added}
                </span>
              </>
            )}
          </div>
        </div>
      </button>

      <div className="track-card__actions">
        <button
          type="button"
          className={`icon-btn track-card__action ${liked ? 'active' : ''}`}
          onClick={(e) => void toggleLike(e)}
          title={liked ? 'Remove from Liked' : 'Like'}
          disabled={busy || !track.id}
        >
          <IconHeart filled={liked} />
        </button>
        <button
          type="button"
          className={`icon-btn track-card__action ${queued ? 'active' : ''}`}
          onClick={(e) => void addQueue(e)}
          title={queued ? 'Added to queue' : 'Add to queue'}
          disabled={busy || !track.uri}
        >
          <IconAddQueue />
        </button>
      </div>
    </div>
  )
}
