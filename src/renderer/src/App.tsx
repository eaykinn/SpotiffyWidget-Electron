import { useEffect, useState } from 'react'
import { spotify } from './api/spotify'
import Library from './components/Library'
import Lyrics from './components/Lyrics'
import MiniPlayer from './components/MiniPlayer'
import Player from './components/Player'
import Settings from './components/Settings'
import { IconClose, IconMini, IconSettings } from './components/Icons'
import { usePlayback } from './hooks/usePlayback'

type View = 'main' | 'settings' | 'lyrics'

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
  const [queueSignal, setQueueSignal] = useState(0)
  const [theme, setTheme] = useState<ThemeSettings>({ theme: 'dark', accentColor: '#1db954' })

  const playbackApi = usePlayback(authed && !booting)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme.theme)
    document.documentElement.style.setProperty('--accent', theme.accentColor)
    document.documentElement.style.setProperty(
      '--accent-hover',
      theme.accentColor === '#1db954' ? '#1ed760' : theme.accentColor
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

  const track = playbackApi.playback?.item

  return (
    <div className="app-shell">
      <div className="titlebar">
        <div className="titlebar__brand">Spotiffy</div>
        <div className="titlebar__actions">
          <button onClick={() => setView('settings')} title="Settings">
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
        {view === 'settings' && (
          <Settings
            onBack={() => setView('main')}
            onThemeChange={(s) => setTheme({ theme: s.theme, accentColor: s.accentColor })}
          />
        )}

        {view === 'lyrics' && track && (
          <Lyrics
            song={track.name}
            artist={track.artists.map((a) => a.name).join(', ')}
            onBack={() => setView('main')}
          />
        )}

        {view === 'main' && (
          <>
            <Player
              api={playbackApi}
              onOpenLyrics={() => setView('lyrics')}
              onOpenQueue={() => setQueueSignal((n) => n + 1)}
            />
            <Library onPlayTrack={playTrack} queueOpenSignal={queueSignal} />
          </>
        )}
      </div>
    </div>
  )
}
