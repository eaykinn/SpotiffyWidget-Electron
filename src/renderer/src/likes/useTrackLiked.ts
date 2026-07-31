import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { spotify } from '../api/spotify'
import { likesStore } from './likesStore'

/**
 * Shared liked state for a track id — Player, MiniPlayer, and TrackCards stay in sync.
 */
export function useTrackLiked(trackId: string | undefined | null, hint?: boolean) {
  const liked = useSyncExternalStore(
    likesStore.subscribe,
    () => (trackId ? Boolean(likesStore.get(trackId)) : false),
    () => false
  )

  useEffect(() => {
    if (!trackId) return
    // Seed only when unknown — never overwrite a value already resolved/toggled.
    if (hint === true && likesStore.get(trackId) === undefined) {
      likesStore.set(trackId, true)
    }
    likesStore.ensureSoon(trackId)
  }, [trackId, hint])

  const toggle = useCallback(async (): Promise<void> => {
    if (!trackId) return
    const next = !liked
    likesStore.set(trackId, next)
    try {
      if (next) await spotify.saveTracks([trackId])
      else await spotify.removeTracks([trackId])
    } catch {
      likesStore.set(trackId, !next)
    }
  }, [trackId, liked])

  return { liked, toggle }
}
