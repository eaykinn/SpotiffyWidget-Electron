import Store from 'electron-store'

export interface Tokens {
  accessToken: string
  refreshToken: string
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
  tokens: { accessToken: '', refreshToken: '' },
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
  return store.get('tokens')
}

export function setTokens(tokens: Partial<Tokens>): void {
  store.set('tokens', { ...getTokens(), ...tokens })
}

export function clearTokens(): void {
  store.set('tokens', { accessToken: '', refreshToken: '' })
}

export function getSettings(): AppSettings {
  return store.get('settings')
}

export function setSettings(settings: Partial<AppSettings>): void {
  store.set('settings', { ...getSettings(), ...settings })
}
