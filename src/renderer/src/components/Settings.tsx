import { useEffect, useState } from 'react'
import { IconBack } from './Icons'

type AppSettings = {
  alwaysOnTop: boolean
  openSpotifyAtStart: boolean
  pauseOnLock: boolean
  preventSleep: boolean
  theme: 'dark' | 'light'
  accentColor: string
}

const ACCENTS = ['#1db954', '#1e90ff', '#ff6b6b', '#f4a261', '#9b5de5', '#00bbf9']

function normalizeHex(color: string): string {
  const c = color.trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(c)) return c
  if (/^#[0-9a-f]{3}$/.test(c)) {
    const [, r, g, b] = c
    return `#${r}${r}${g}${g}${b}${b}`
  }
  return c
}

interface Props {
  onBack: () => void
  onThemeChange: (settings: AppSettings) => void
}

export default function Settings({ onBack, onThemeChange }: Props) {
  const [settings, setLocal] = useState<AppSettings | null>(null)

  useEffect(() => {
    void window.spotiffy.settings.get().then(setLocal)
  }, [])

  async function update(partial: Partial<AppSettings>): Promise<void> {
    const next = await window.spotiffy.settings.set(partial)
    setLocal(next)
    onThemeChange(next)
  }

  if (!settings) return <div className="empty">Loading…</div>

  const accent = normalizeHex(settings.accentColor)
  const isCustomAccent = !ACCENTS.includes(accent)

  return (
    <div className="settings-panel">
      <div className="detail-header">
        <button className="back-btn" onClick={onBack}>
          <IconBack /> Back
        </button>
        <h3 className="detail-header__title">Settings</h3>
      </div>

      <div className="scroll">
      <div className="panel">
        <Toggle
          label="Always on top"
          value={settings.alwaysOnTop}
          onChange={(v) => void update({ alwaysOnTop: v })}
        />
        <Toggle
          label="Open Spotify at start"
          value={settings.openSpotifyAtStart}
          onChange={(v) => void update({ openSpotifyAtStart: v })}
        />
        <Toggle
          label="Pause on lock / sleep"
          value={settings.pauseOnLock}
          onChange={(v) => void update({ pauseOnLock: v })}
        />
        <Toggle
          label="Prevent sleep"
          value={settings.preventSleep}
          onChange={(v) => void update({ preventSleep: v })}
        />

        <div className="setting-row">
          <div>
            Theme
            <span style={{ display: 'block' }}>Light or dark shell</span>
          </div>
          <div className="segment" style={{ margin: 0 }}>
            <button
              className={settings.theme === 'dark' ? 'active' : ''}
              onClick={() => void update({ theme: 'dark' })}
            >
              Dark
            </button>
            <button
              className={settings.theme === 'light' ? 'active' : ''}
              onClick={() => void update({ theme: 'light' })}
            >
              Light
            </button>
          </div>
        </div>

        <div>
          <div style={{ marginBottom: 8 }}>Accent</div>
          <div className="color-row">
            {ACCENTS.map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch ${accent === c ? 'active' : ''}`}
                style={{ background: c }}
                title={c}
                onClick={() => void update({ accentColor: c })}
              />
            ))}
            <label
              className={`swatch swatch--picker ${isCustomAccent ? 'active' : ''}`}
              style={isCustomAccent ? { background: accent } : undefined}
              title="Custom color"
            >
              <input
                type="color"
                className="swatch__input"
                value={accent}
                onChange={(e) => void update({ accentColor: normalizeHex(e.target.value) })}
              />
              <span className="swatch__picker-icon" aria-hidden>
                +
              </span>
            </label>
          </div>
        </div>

        <button
          className="btn btn-ghost"
          onClick={() => void window.spotiffy.shell.openSpotify()}
        >
          Open Spotify
        </button>

        <button
          className="btn btn-ghost"
          onClick={async () => {
            await window.spotiffy.auth.logout()
            window.location.reload()
          }}
        >
          Log out
        </button>
      </div>
      </div>
    </div>
  )
}

function Toggle({
  label,
  value,
  onChange
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="setting-row">
      <div>{label}</div>
      <button
        className={`toggle ${value ? 'on' : ''}`}
        onClick={() => onChange(!value)}
        aria-pressed={value}
      />
    </div>
  )
}
