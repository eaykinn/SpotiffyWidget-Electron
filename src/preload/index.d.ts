import type { SpotiffyApi } from './index'

declare global {
  interface Window {
    spotiffy: SpotiffyApi
  }
}

export {}
