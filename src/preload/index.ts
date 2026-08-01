import { contextBridge, ipcRenderer } from 'electron'

export type AppSettings = {
  alwaysOnTop: boolean
  openSpotifyAtStart: boolean
  pauseOnLock: boolean
  preventSleep: boolean
  theme: 'dark' | 'light'
  accentColor: string
  beatVisualizer: boolean
}

const api = {
  auth: {
    grant: (): Promise<boolean> => ipcRenderer.invoke('auth:grant'),
    login: (): Promise<boolean> => ipcRenderer.invoke('auth:login'),
    logout: (): Promise<boolean> => ipcRenderer.invoke('auth:logout'),
    isLoggedIn: (): Promise<boolean> => ipcRenderer.invoke('auth:isLoggedIn'),
    getAccessToken: (): Promise<string | null> => ipcRenderer.invoke('auth:getAccessToken')
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
    set: (partial: Partial<AppSettings>): Promise<AppSettings> =>
      ipcRenderer.invoke('settings:set', partial)
  },
  window: {
    minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
    hide: (): Promise<void> => ipcRenderer.invoke('window:hide'),
    setMini: (mini: boolean): Promise<void> => ipcRenderer.invoke('window:setMini', mini),
    isMini: (): Promise<boolean> => ipcRenderer.invoke('window:isMini')
  },
  shell: {
    openSpotify: (): Promise<boolean> => ipcRenderer.invoke('shell:openSpotify')
  },
  lyrics: {
    fetch: (song: string, artist: string, durationMs?: number): Promise<string> =>
      ipcRenderer.invoke('lyrics:fetch', song, artist, durationMs)
  },
  audio: {
    fetchPreview: (url: string): Promise<ArrayBuffer | null> =>
      ipcRenderer.invoke('audio:fetchPreview', url)
  },
  onLock: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('system:lock', handler)
    return () => ipcRenderer.removeListener('system:lock', handler)
  }
}

contextBridge.exposeInMainWorld('spotiffy', api)

export type SpotiffyApi = typeof api
