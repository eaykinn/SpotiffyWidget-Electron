import { useEffect, useState } from 'react'
import { spotify } from './api/spotify'
import Library from './components/Library'
import Lyrics from './components/Lyrics'
import MiniPlayer from './components/MiniPlayer'
import Player from './components/Player'
import Settings from './components/Settings'
import { IconClose, IconMini, IconSettings } from './components/Icons'
import { usePlayback } from './hooks/usePlayback'

type View = 'main' | 'settings'
type BottomPanel = 'library' | 'lyrics'

interface ThemeSettings {
  theme: 'dark' | 'light'
  accentColor: string
}

export default function App() {
  const [booting, setBooting] = useState(true)
  const [authed, setAuthed] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [mini, setMini] = useState(false)
  const [view, setView] = useState<View>('main')
  const [bottom, setBottom] = useState<BottomPanel>('library')
  const [queueSignal, setQueueSignal] = useState(0)
  const [theme, setTheme] = useState<ThemeSettings>({ theme: 'dark', accentColor: '#1db954' })

  const playbackApi = usePlayback(authed && !booting)

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', theme.theme)
    root.style.setProperty('--accent', theme.accentColor)
    root.style.setProperty(
      '--accent-hover',
      `color-mix(in srgb, ${theme.accentColor} 78%, white)`
    )
    root.style.setProperty(
      '--accent-soft',
      `color-mix(in srgb, ${theme.accentColor} 22%, transparent)`
    )
    root.style.setProperty(
      '--accent-glow',
      `color-mix(in srgb, ${theme.accentColor} 35%, transparent)`
    )
  }, [theme])

  useEffect(() => {
    void (async () => {
      const settings = await window.spotiffy.settings.get()
      setTheme({ theme: settings.theme, accentColor: settings.accentColor })
      try {
        const ok = await window.spotiffy.auth.grant()
        setAuthed(ok)
        if (!ok) setAuthError('Could not authenticate with Spotify.')
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Auth failed')
        setAuthed(false)
      } finally {
        setBooting(false)
      }
    })()
  }, [])

  useEffect(() => {
    return window.spotiffy.onLock(() => {
      void spotify.pause().catch(() => undefined)
    })
  }, [])

  // When track changes while lyrics are open, keep panel but refetch via Lyrics props
  const track = playbackApi.playback?.item

  const enterMini = async (): Promise<void> => {
    await window.spotiffy.window.setMini(true)
    setMini(true)
  }

  const exitMini = async (): Promise<void> => {
    await window.spotiffy.window.setMini(false)
    setMini(false)
  }

  const playTrack = async (uri: string): Promise<void> => {
    await spotify.ensureDevice()
    await spotify.play({ uris: [uri] })
    await playbackApi.refresh()
  }

  if (booting) {
    return (
      <div className="app-shell">
        <div className="center">Starting…</div>
      </div>
    )
  }

  if (!authed) {
    return (
      <div className="app-shell">
        <div className="titlebar">
          <div className="titlebar__brand">Spotiffy</div>
          <div className="titlebar__actions">
            <button onClick={() => void window.spotiffy.window.hide()} title="Close">
              <IconClose />
            </button>
          </div>
        </div>
        <div className="center login-screen">
          <h1>Spotiffy</h1>
          <p>Connect your Spotify account to control playback from this desktop widget.</p>
          {authError && <p style={{ color: 'var(--danger)' }}>{authError}</p>}
          <button
            className="btn"
            onClick={async () => {
              setAuthError(null)
              try {
                const ok = await window.spotiffy.auth.login()
                setAuthed(ok)
              } catch (err) {
                setAuthError(err instanceof Error ? err.message : 'Login failed')
              }
            }}
          >
            Log in with Spotify
          </button>
          <p style={{ fontSize: 12 }}>
            Requires <code>SPOTIFY_CLIENT_ID</code> and redirect{' '}
            <code>http://127.0.0.1:5000/callback/</code>
          </p>
        </div>
      </div>
    )
  }

  if (mini) {
    return <MiniPlayer api={playbackApi} onExpand={() => void exitMini()} />
  }

  return (
    <div className="app-shell">
      <div className="titlebar">
        <div className="titlebar__brand">Spotiffy</div>
        <div className="titlebar__actions">
          <button
            onClick={() => {
              setView('settings')
              setBottom('library')
            }}
            title="Settings"
          >
            <IconSettings />
          </button>
          <button onClick={() => void enterMini()} title="Mini player">
            <IconMini />
          </button>
          <button onClick={() => void window.spotiffy.window.hide()} title="Close to tray">
            <IconClose />
          </button>
        </div>
      </div>

      <div className="content">
        {view === 'settings' ? (
          <Settings
            onBack={() => setView('main')}
            onThemeChange={(s) => setTheme({ theme: s.theme, accentColor: s.accentColor })}
          />
        ) : (
          <>
            <Player
              api={playbackApi}
              onOpenLyrics={() => {
                if (track) setBottom('lyrics')
              }}
              onOpenQueue={() => {
                setBottom('library')
                setQueueSignal((n) => n + 1)
              }}
            />

            {bottom === 'lyrics' && track ? (
              <Lyrics
                song={track.name}
                artist={track.artists.map((a) => a.name).join(', ')}
                durationMs={track.duration_ms}
                onBack={() => setBottom('library')}
              />
            ) : (
              <Library onPlayTrack={playTrack} queueOpenSignal={queueSignal} />
            )}
          </>
        )}
      </div>
    </div>
  )
}
