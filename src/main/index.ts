import { config as loadEnv } from 'dotenv'
import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  nativeImage,
  powerMonitor,
  powerSaveBlocker,
  screen,
  shell
} from 'electron'
import { dirname, join } from 'path'
import { grantAccess, getValidAccessToken, isLoggedIn, login, logout } from './auth'
import { fetchLyrics } from './lyrics'
import { getSettings, setSettings, type AppSettings } from './store'

// Dev: project .env. Packaged: resources/.env (bundled) or next to the .exe
for (const envPath of [
  join(process.cwd(), '.env'),
  ...(app.isPackaged
    ? [join(process.resourcesPath, '.env'), join(dirname(process.execPath), '.env')]
    : [])
]) {
  loadEnv({ path: envPath, override: false })
}

const FULL_SIZE = { width: 450, height: 770 }
const MINI_SIZE = { width: 380, height: 140 }
const FULL_MIN = { width: 400, height: 290 }
const FULL_MAX = { width: 600, height: 900 }

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let sleepBlockerId: number | null = null
let isQuitting = false
let isMini = false
let chromeRefreshTimer: ReturnType<typeof setTimeout> | null = null
let chromeRefreshing = false
let saveBoundsTimer: ReturnType<typeof setTimeout> | null = null

function clampFullSize(width: number, height: number): { width: number; height: number } {
  return {
    width: Math.min(FULL_MAX.width, Math.max(FULL_MIN.width, Math.round(width))),
    height: Math.min(FULL_MAX.height, Math.max(FULL_MIN.height, Math.round(height)))
  }
}

function getSavedFullSize(): { width: number; height: number } {
  const s = getSettings()
  return clampFullSize(s.windowWidth || FULL_SIZE.width, s.windowHeight || FULL_SIZE.height)
}

/** Keep the window on a visible display (monitor unplugged, etc.). */
function clampPosition(
  x: number,
  y: number,
  width: number,
  height: number
): { x: number; y: number } {
  const displays = screen.getAllDisplays()
  const overlaps = displays.some((d) => {
    const a = d.workArea
    return x < a.x + a.width && x + width > a.x && y < a.y + a.height && y + height > a.y
  })
  if (overlaps) return { x: Math.round(x), y: Math.round(y) }

  const primary = screen.getPrimaryDisplay().workArea
  return {
    x: Math.round(primary.x + Math.max(0, (primary.width - width) / 2)),
    y: Math.round(primary.y + Math.max(0, (primary.height - height) / 2))
  }
}

function getSavedPosition(width: number, height: number): { x: number; y: number } | null {
  const s = getSettings()
  if (typeof s.windowX !== 'number' || typeof s.windowY !== 'number') return null
  return clampPosition(s.windowX, s.windowY, width, height)
}

function persistWindowBounds(options?: { size?: boolean; position?: boolean }): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const saveSize = options?.size !== false && !isMini
  const savePos = options?.position !== false
  if (!saveSize && !savePos) return

  const bounds = mainWindow.getBounds()
  const cur = getSettings()
  const patch: Partial<AppSettings> = {}

  if (saveSize) {
    const { width, height } = clampFullSize(bounds.width, bounds.height)
    if (cur.windowWidth !== width || cur.windowHeight !== height) {
      patch.windowWidth = width
      patch.windowHeight = height
    }
  }

  if (savePos) {
    const x = Math.round(bounds.x)
    const y = Math.round(bounds.y)
    if (cur.windowX !== x || cur.windowY !== y) {
      patch.windowX = x
      patch.windowY = y
    }
  }

  if (Object.keys(patch).length > 0) setSettings(patch)
}

function persistFullSizeFromWindow(): void {
  persistWindowBounds({ size: true, position: true })
}

function schedulePersistBounds(): void {
  if (saveBoundsTimer) clearTimeout(saveBoundsTimer)
  saveBoundsTimer = setTimeout(() => {
    saveBoundsTimer = null
    persistWindowBounds({ size: !isMini, position: true })
  }, 200)
}

/**
 * Win11 DWM paints a white inactive frame into transparent corner pixels on blur.
 * A 1px size nudge (what manual resize does) forces DWM to drop that chrome.
 */
function refreshTransparentChrome(): void {
  if (chromeRefreshing) return
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) return

  chromeRefreshing = true
  try {
    const bounds = mainWindow.getBounds()
    const min = mainWindow.getMinimumSize()
    const max = mainWindow.getMaximumSize()
    const resizable = mainWindow.isResizable()

    mainWindow.setResizable(true)
    mainWindow.setMinimumSize(1, 1)
    mainWindow.setMaximumSize(10000, 10000)
    mainWindow.setBounds({ ...bounds, width: bounds.width + 1 })
    mainWindow.setBounds(bounds)
    mainWindow.setMinimumSize(min[0], min[1])
    mainWindow.setMaximumSize(max[0], max[1])
    mainWindow.setResizable(resizable)
    mainWindow.setBackgroundColor('#00000000')
  } finally {
    // Ignore activation messages caused by our own nudge
    setTimeout(() => {
      chromeRefreshing = false
    }, 80)
  }
}

function scheduleChromeRefresh(): void {
  if (process.platform !== 'win32' || chromeRefreshing) return
  if (chromeRefreshTimer) clearTimeout(chromeRefreshTimer)
  // Let DWM finish painting the inactive frame, then clear it
  chromeRefreshTimer = setTimeout(() => {
    chromeRefreshTimer = null
    refreshTransparentChrome()
  }, 30)
}

function createWindow(): void {
  const settings = getSettings()
  const size = getSavedFullSize()
  const pos = getSavedPosition(size.width, size.height)

  mainWindow = new BrowserWindow({
    width: size.width,
    height: size.height,
    ...(pos ? { x: pos.x, y: pos.y } : {}),
    minWidth: FULL_MIN.width,
    minHeight: FULL_MIN.height,
    maxWidth: FULL_MAX.width,
    maxHeight: FULL_MAX.height,
    frame: false,
    transparent: true,
    resizable: true,
    show: false,
    alwaysOnTop: settings.alwaysOnTop,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    // Win11 DWM rounded inactive-frame is what draws the white corner blocks
    roundedCorners: false,
    thickFrame: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    scheduleChromeRefresh()
  })

  mainWindow.on('blur', () => scheduleChromeRefresh())
  mainWindow.on('focus', () => scheduleChromeRefresh())
  mainWindow.on('resized', () => schedulePersistBounds())
  mainWindow.on('resize', () => schedulePersistBounds())
  mainWindow.on('moved', () => schedulePersistBounds())
  mainWindow.on('move', () => schedulePersistBounds())

  // WM_NCACTIVATE — DWM activation changes are what spawn the white frame
  if (process.platform === 'win32') {
    mainWindow.hookWindowMessage(0x0086, () => {
      scheduleChromeRefresh()
    })
  }

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createTray(): void {
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon.isEmpty() ? nativeImage.createFromDataURL(TRAY_PNG) : icon)
  tray.setToolTip('Spotiffy Widget')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Open',
        click: () => {
          mainWindow?.show()
          mainWindow?.focus()
        }
      },
      {
        label: 'Exit',
        click: () => {
          isQuitting = true
          app.quit()
        }
      }
    ])
  )
  tray.on('double-click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
}

function applyPreventSleep(enabled: boolean): void {
  if (enabled) {
    if (sleepBlockerId === null) {
      sleepBlockerId = powerSaveBlocker.start('prevent-app-suspension')
    }
  } else if (sleepBlockerId !== null) {
    powerSaveBlocker.stop(sleepBlockerId)
    sleepBlockerId = null
  }
}

function registerIpc(): void {
  ipcMain.handle('auth:grant', async () => grantAccess())
  ipcMain.handle('auth:login', async () => login())
  ipcMain.handle('auth:logout', () => {
    logout()
    return true
  })
  ipcMain.handle('auth:isLoggedIn', () => isLoggedIn())
  ipcMain.handle('auth:getAccessToken', async () => getValidAccessToken())

  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:set', (_e, partial: Partial<AppSettings>) => {
    setSettings(partial)
    const settings = getSettings()
    if (partial.alwaysOnTop !== undefined) {
      mainWindow?.setAlwaysOnTop(settings.alwaysOnTop)
    }
    if (partial.preventSleep !== undefined) {
      applyPreventSleep(settings.preventSleep)
    }
    if (partial.theme !== undefined) {
      scheduleChromeRefresh()
    }
    return settings
  })

  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize()
  })

  ipcMain.handle('window:hide', () => {
    mainWindow?.hide()
  })

  ipcMain.handle('window:setMini', (_e, mini: boolean) => {
    if (!mainWindow) return
    if (mini) {
      // Capture current full size + position before collapsing to mini
      persistWindowBounds({ size: true, position: true })
      isMini = true
      mainWindow.setMinimumSize(MINI_SIZE.width, MINI_SIZE.height)
      mainWindow.setMaximumSize(MINI_SIZE.width, MINI_SIZE.height)
      mainWindow.setSize(MINI_SIZE.width, MINI_SIZE.height)
      mainWindow.setResizable(false)
    } else {
      const size = getSavedFullSize()
      const pos = getSavedPosition(size.width, size.height)
      isMini = false
      mainWindow.setResizable(true)
      mainWindow.setMinimumSize(FULL_MIN.width, FULL_MIN.height)
      mainWindow.setMaximumSize(FULL_MAX.width, FULL_MAX.height)
      if (pos) {
        mainWindow.setBounds({ x: pos.x, y: pos.y, width: size.width, height: size.height })
      } else {
        mainWindow.setSize(size.width, size.height)
      }
    }
  })

  ipcMain.handle('window:isMini', () => isMini)

  ipcMain.handle('shell:openSpotify', async () => {
    try {
      await shell.openExternal('spotify:')
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle(
    'lyrics:fetch',
    async (_e, song: string, artist: string, durationMs?: number) => {
      return fetchLyrics(song, artist, durationMs)
    }
  )

  ipcMain.handle('audio:fetchPreview', async (_e, url: string) => {
    if (typeof url !== 'string' || !/^https:\/\/p\.scdn\.co\//i.test(url)) {
      return null
    }
    try {
      const res = await fetch(url)
      if (!res.ok) return null
      // ArrayBuffer clones cleanly over IPC (Uint8Array often arrives corrupted)
      return await res.arrayBuffer()
    } catch {
      return null
    }
  })
}

function registerPowerHooks(): void {
  powerMonitor.on('lock-screen', () => {
    if (getSettings().pauseOnLock) {
      mainWindow?.webContents.send('system:lock')
    }
  })

  powerMonitor.on('suspend', () => {
    if (getSettings().pauseOnLock) {
      mainWindow?.webContents.send('system:lock')
    }
  })
}

app.whenReady().then(async () => {
  registerIpc()
  createWindow()
  createTray()
  registerPowerHooks()

  const settings = getSettings()
  applyPreventSleep(settings.preventSleep)

  if (settings.openSpotifyAtStart) {
    shell.openExternal('spotify:').catch(() => undefined)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else mainWindow?.show()
  })
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Keep running in tray; do not quit
  }
})

/** Minimal green spot PNG for tray (1x1 scaled looks fine as placeholder) */
const TRAY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAhElEQVQ4T2NkYGD4z0ABYBzVMKoBBgYGBkYGBoZRG2BgYGBgZGBg+P///38GBgYGRkZGRgYGBgZGRkZGBgYGBkZGRkYGBgYGRkZGRgYGBgZGRkZGBgYGBkZGRkYGBgYGRkZGRgYGBgZGRkZGBgYGBkZGRkYGBgYGRkZGRgYGBgZGRkZGBgYGBkZGRkYGBgYGRkZGRgYAAH8PBQF2mQYdAAAAAElFUESuQmCC'
