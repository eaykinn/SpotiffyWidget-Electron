import Store from 'electron-store'

export interface Tokens {
  accessToken: string
  refreshToken: string
  /** epoch ms when access token should be treated as expired */
  expiresAt: number
}

export interface AppSettings {
  alwaysOnTop: boolean
  openSpotifyAtStart: boolean
  pauseOnLock: boolean
  preventSleep: boolean
  theme: 'dark' | 'light'
  accentColor: string
}

const defaults: { tokens: Tokens; settings: AppSettings } = {
  tokens: { accessToken: '', refreshToken: '', expiresAt: 0 },
  settings: {
    alwaysOnTop: true,
    openSpotifyAtStart: false,
    pauseOnLock: true,
    preventSleep: false,
    theme: 'dark',
    accentColor: '#1db954'
  }
}

const store = new Store({ defaults })

export function getTokens(): Tokens {
  const t = store.get('tokens')
  return {
    accessToken: t.accessToken ?? '',
    refreshToken: t.refreshToken ?? '',
    expiresAt: typeof t.expiresAt === 'number' ? t.expiresAt : 0
  }
}

export function setTokens(tokens: Partial<Tokens>): void {
  store.set('tokens', { ...getTokens(), ...tokens })
}

export function clearTokens(): void {
  store.set('tokens', { accessToken: '', refreshToken: '', expiresAt: 0 })
}

export function getSettings(): AppSettings {
  return store.get('settings')
}

export function setSettings(settings: Partial<AppSettings>): void {
  store.set('settings', { ...getSettings(), ...settings })
}
