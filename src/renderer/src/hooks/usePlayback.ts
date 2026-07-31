import { useCallback, useEffect, useRef, useState } from 'react'
import { spotify } from '../api/spotify'
import type { PlaybackState } from '../types/spotify'

const POLL_MS = 1000

export function usePlayback(enabled: boolean) {
  const [playback, setPlayback] = useState<PlaybackState | null>(null)
  const [liked, setLiked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const localProgress = useRef(0)
  const lastServer = useRef(0)

  const refresh = useCallback(async () => {
    if (!enabled) return
    try {
      const state = await spotify.getPlayback()
      setPlayback(state)
      setError(null)
      if (state?.progress_ms != null) {
        localProgress.current = state.progress_ms
        lastServer.current = Date.now()
      }
      if (state?.item?.id) {
        const [isLiked] = await spotify.checkSaved([state.item.id])
        setLiked(Boolean(isLiked))
      } else {
        setLiked(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Playback error')
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    void refresh()
    const id = window.setInterval(() => void refresh(), POLL_MS)
    return () => window.clearInterval(id)
  }, [enabled, refresh])

  // Smooth progress between polls
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    if (!playback?.is_playing) {
      setProgress(playback?.progress_ms ?? 0)
      return
    }
    const id = window.setInterval(() => {
      const elapsed = Date.now() - lastServer.current
      const next = Math.min(
        (playback.item?.duration_ms ?? 0),
        localProgress.current + elapsed
      )
      setProgress(next)
    }, 250)
    return () => window.clearInterval(id)
  }, [playback])

  const playPause = async (): Promise<void> => {
    if (playback?.is_playing) await spotify.pause()
    else {
      await spotify.ensureDevice()
      await spotify.play()
    }
    await refresh()
  }

  const next = async (): Promise<void> => {
    await spotify.next()
    await refresh()
  }

  const previous = async (): Promise<void> => {
    await spotify.previous()
    await refresh()
  }

  const seek = async (ms: number): Promise<void> => {
    await spotify.seek(ms)
    localProgress.current = ms
    lastServer.current = Date.now()
    setProgress(ms)
  }

  const toggleShuffle = async (): Promise<void> => {
    await spotify.setShuffle(!playback?.shuffle_state)
    await refresh()
  }

  const cycleRepeat = async (): Promise<void> => {
    const order: Array<'off' | 'context' | 'track'> = ['off', 'context', 'track']
    const current = playback?.repeat_state ?? 'off'
    const nextState = order[(order.indexOf(current) + 1) % order.length]
    await spotify.setRepeat(nextState)
    await refresh()
  }

  const setVolume = async (percent: number): Promise<void> => {
    await spotify.setVolume(percent)
  }

  const toggleLike = async (): Promise<void> => {
    const id = playback?.item?.id
    if (!id) return
    if (liked) await spotify.removeTracks([id])
    else await spotify.saveTracks([id])
    setLiked(!liked)
  }

  return {
    playback,
    progress,
    liked,
    error,
    refresh,
    playPause,
    next,
    previous,
    seek,
    toggleShuffle,
    cycleRepeat,
    setVolume,
    toggleLike
  }
}
