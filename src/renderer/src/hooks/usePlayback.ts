import { useCallback, useEffect, useRef, useState } from 'react'
import { spotify } from '../api/spotify'
import type { PlaybackState } from '../types/spotify'

/** Playing: keep UI in sync without hammering the API. */
const POLL_PLAYING_MS = 5000
/** Paused / idle: state rarely changes. */
const POLL_IDLE_MS = 12000
/** Spotify /me/player often returns stale progress right after seek. */
const SEEK_GUARD_MS = 4000
const SEEK_STALE_DRIFT_MS = 2000

export function usePlayback(enabled: boolean) {
  const [playback, setPlayback] = useState<PlaybackState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const localProgress = useRef(0)
  const lastServer = useRef(0)
  const refreshInFlight = useRef(false)
  const playbackRef = useRef<PlaybackState | null>(null)
  const seekGuardUntil = useRef(0)

  useEffect(() => {
    playbackRef.current = playback
  }, [playback])

  const applyProgressFromServer = useCallback((state: PlaybackState): PlaybackState => {
    if (state.progress_ms == null) return state

    const now = Date.now()
    if (now < seekGuardUntil.current) {
      const elapsed = state.is_playing ? now - lastServer.current : 0
      const expected = localProgress.current + Math.max(0, elapsed)
      if (Math.abs(state.progress_ms - expected) > SEEK_STALE_DRIFT_MS) {
        // Keep optimistic seek position; still accept the rest of playback state.
        return { ...state, progress_ms: Math.round(localProgress.current) }
      }
      // Server caught up — drop the guard early.
      seekGuardUntil.current = 0
    }

    localProgress.current = state.progress_ms
    lastServer.current = now
    return state
  }, [])

  const refresh = useCallback(async (): Promise<void> => {
    if (!enabled || refreshInFlight.current) return
    if (typeof document !== 'undefined' && document.hidden) return
    refreshInFlight.current = true
    try {
      const state = await spotify.getPlayback()
      if (state) {
        setPlayback(applyProgressFromServer(state))
      } else {
        setPlayback(null)
      }
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Playback error')
    } finally {
      refreshInFlight.current = false
    }
  }, [enabled, applyProgressFromServer])

  // Adaptive poll: slower when idle, stopped while the window is hidden.
  useEffect(() => {
    if (!enabled) return

    let timer: ReturnType<typeof setTimeout> | null = null
    let cancelled = false

    const schedule = (): void => {
      if (cancelled || document.hidden) return
      const playing = Boolean(playbackRef.current?.is_playing)
      const delay = playing ? POLL_PLAYING_MS : POLL_IDLE_MS
      timer = setTimeout(() => {
        void (async () => {
          await refresh()
          schedule()
        })()
      }, delay)
    }

    void refresh().then(schedule)

    const onVis = (): void => {
      if (document.hidden) {
        if (timer) clearTimeout(timer)
        timer = null
        return
      }
      void refresh().then(() => {
        if (!timer) schedule()
      })
    }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [enabled, refresh])

  const [progress, setProgress] = useState(0)
  useEffect(() => {
    if (!playback?.is_playing) {
      // Prefer local clock during seek guard so paused scrub doesn't snap back.
      if (Date.now() < seekGuardUntil.current) {
        setProgress(localProgress.current)
        return
      }
      setProgress(playback?.progress_ms ?? 0)
      return
    }
    const id = window.setInterval(() => {
      const elapsed = Date.now() - lastServer.current
      const next = Math.min(
        playback.item?.duration_ms ?? 0,
        localProgress.current + elapsed
      )
      setProgress(next)
    }, 250)
    return () => window.clearInterval(id)
  }, [playback])

  const playPause = async (): Promise<void> => {
    if (playback?.is_playing) await spotify.pause()
    else {
      // Skip /devices when Connect already reports an active device.
      if (!playback?.device?.is_active) await spotify.ensureDevice()
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
    // Optimistic first — Spotify often lags on /me/player after seek.
    localProgress.current = ms
    lastServer.current = Date.now()
    seekGuardUntil.current = Date.now() + SEEK_GUARD_MS
    setProgress(ms)
    setPlayback((prev) => (prev ? { ...prev, progress_ms: ms } : prev))
    await spotify.seek(ms)
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

  return {
    playback,
    progress,
    error,
    refresh,
    playPause,
    next,
    previous,
    seek,
    toggleShuffle,
    cycleRepeat,
    setVolume
  }
}
