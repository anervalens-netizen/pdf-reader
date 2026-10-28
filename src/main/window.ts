import { BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { saveWindowState } from './store'
import type { WindowState } from '../shared/api'

let mainWindow: BrowserWindow | null = null

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export const LIGHT_OVERLAY = { background: '#f7f5f2', symbol: '#2a2926' }
export const DARK_OVERLAY = { background: '#141413', symbol: '#e7e4de' }

export function getTitleBarColors(theme: 'light' | 'dark'): { background: string; symbol: string } {
  return theme === 'dark' ? DARK_OVERLAY : LIGHT_OVERLAY
}

export function createWindow(state: WindowState): BrowserWindow {
  const isWindows = process.platform === 'win32'
  const isMac = process.platform === 'darwin'

  const win = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: Math.max(900, state.width || 1320),
    height: Math.max(640, state.height || 880),
    minWidth: 720,
    minHeight: 520,
    show: false,
    backgroundColor: LIGHT_OVERLAY.background,
    title: 'PDF',
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    titleBarOverlay: isWindows
      ? { color: LIGHT_OVERLAY.background, symbolColor: LIGHT_OVERLAY.symbol, height: 44 }
      : undefined,
    trafficLightPosition: isMac ? { x: 14, y: 14 } : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      webviewTag: false
    }
  })

  mainWindow = win
  if (state.maximized) win.maximize()

  win.once('ready-to-show', () => win.show())

  win.on('resized', () => saveWindowState(win))
  win.on('moved', () => saveWindowState(win))
  win.on('close', () => saveWindowState(win))

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  return win
}

export async function loadRenderer(win: BrowserWindow): Promise<void> {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    await win.loadURL(devUrl)
  } else {
    await win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}
