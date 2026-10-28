import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { statSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { createWindow, getMainWindow } from './window'
import { buildApplicationMenu } from './menu'
import { loadWindowState, saveWindowState } from './store'
import { registerIpcHandlers } from './ipc'
import { authorizePdfPath } from './pdfAccess'

/** Files requested by the OS (double-click on a .pdf, "Open with", launch args). */
const pendingOpens = new Set<string>()
let rendererReady = false

function isPdf(path: string): boolean {
  return extname(path).toLowerCase() === '.pdf'
}

/** Find a .pdf path inside process arguments (Windows/Linux file associations). */
export function findPdfArgument(argv: string[]): string | null {
  const candidates = argv.slice(1).filter((arg) => !arg.startsWith('-'))
  for (const candidate of candidates) {
    if (!isPdf(candidate)) continue
    try {
      const stats = statSyncSafe(candidate)
      if (stats?.isFile()) return candidate
    } catch {
      /* ignore */
    }
  }
  return null
}

function statSyncSafe(path: string): { isFile(): boolean } | null {
  try {
    return statSync(path)
  } catch {
    return null
  }
}

function flushPendingOpens(): void {
  if (pendingOpens.size === 0) return
  const win = getMainWindow()
  if (!win || !rendererReady) return
  for (const path of pendingOpens) {
    win.webContents.send('pdf:file-opened', { path, name: basename(path) })
  }
  pendingOpens.clear()
}

async function openPathInApp(path: string): Promise<void> {
  try {
    const stats = await stat(path)
    if (!stats.isFile()) return
    if (!isPdf(path)) {
      const win = getMainWindow()
      await dialog.showMessageBox(win ?? (BrowserWindow.getFocusedWindow() as BrowserWindow), {
        type: 'warning',
        title: 'Tip de fișier neacceptat',
        message: 'PDF poate deschide doar fișiere PDF.',
        detail: basename(path),
        buttons: ['OK']
      })
      return
    }
    if (!authorizePdfPath(path)) return
    pendingOpens.add(path)
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore()
      win.focus()
      flushPendingOpens()
    }
  } catch (error) {
    console.error('[main] failed to open', path, error)
  }
}

// Single instance: a second launch (e.g. double-clicking another PDF) reuses this window.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const file = findPdfArgument(argv)
    if (file) void openPathInApp(file)
    else {
      const win = getMainWindow()
      if (win) {
        if (win.isMinimized()) win.restore()
        win.focus()
      }
    }
  })
}

app.whenReady().then(async () => {
  registerIpcHandlers()

  ipcMain.on('pdf:renderer-ready', (event) => {
    if (event.sender !== getMainWindow()?.webContents) return
    rendererReady = true
    flushPendingOpens()
  })

  ipcMain.on('pdf:file-dropped', (event, path: string) => {
    if (event.sender !== getMainWindow()?.webContents) return
    if (typeof path === 'string' && path) void openPathInApp(path)
  })

  if (launchArg) authorizePdfPath(launchArg)
  const win = createWindow(loadWindowState())
  const { loadRenderer } = await import('./window')
  win.webContents.on('did-start-loading', () => { rendererReady = false })
  await loadRenderer(win)

  buildApplicationMenu(() => getMainWindow())

  if (process.env.PDF_CAPTURE_DIR && process.env.PDF_CAPTURE_PDF) {
    void import('./capture').then((m) => m.runCaptureSequence(win, process.env.PDF_CAPTURE_PDF!))
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const created = createWindow(loadWindowState())
      rendererReady = false
      void loadRenderer(created)
    }
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
})

app.on('before-quit', () => {
  saveWindowState()
})

// macOS: files opened from Finder.
app.on('open-file', (event, path) => {
  event.preventDefault()
  void openPathInApp(path)
})

// Windows/Linux: first launch with a file argument.
const launchArg = findPdfArgument(process.argv)
if (launchArg) pendingOpens.add(launchArg)

export { openPathInApp }
