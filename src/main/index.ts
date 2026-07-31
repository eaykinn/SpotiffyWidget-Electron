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
  shell
} from 'electron'
import { join } from 'path'
import { grantAccess, getValidAccessToken, isLoggedIn, login, logout } from './auth'
import { fetchLyrics } from './lyrics'
import { getSettings, setSettings, type AppSettings } from './store'

loadEnv({ path: join(process.cwd(), '.env') })

const FULL_SIZE = { width: 450, height: 770 }
const MINI_SIZE = { width: 380, height: 140 }

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let sleepBlockerId: number | null = null
let isQuitting = false
let isMini = false

function createWindow(): void {
  const settings = getSettings()

  mainWindow = new BrowserWindow({
    width: FULL_SIZE.width,
    height: FULL_SIZE.height,
    minWidth: 400,
    minHeight: 650,
    maxWidth: 600,
    maxHeight: 900,
    frame: false,
    transparent: true,
    resizable: true,
    show: false,
    alwaysOnTop: settings.alwaysOnTop,
    skipTaskbar: true,
    // Must be fully transparent so CSS border-radius can clip the window corners
    backgroundColor: '#00000000',
    hasShadow: false,
    roundedCorners: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

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
    isMini = mini
    if (mini) {
      mainWindow.setMinimumSize(MINI_SIZE.width, MINI_SIZE.height)
      mainWindow.setMaximumSize(MINI_SIZE.width, MINI_SIZE.height)
      mainWindow.setSize(MINI_SIZE.width, MINI_SIZE.height)
      mainWindow.setResizable(false)
    } else {
      mainWindow.setResizable(true)
      mainWindow.setMinimumSize(400, 650)
      mainWindow.setMaximumSize(600, 900)
      mainWindow.setSize(FULL_SIZE.width, FULL_SIZE.height)
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
