import { app, dialog, ipcMain, shell } from 'electron'
import { basename, dirname, extname } from 'node:path'
import { getMainWindow } from './window'
import { readBinary, writeBinary } from './store'
import type { OpenedFile, SaveResult } from '../shared/api'

async function openFileAt(path: string): Promise<OpenedFile | null> {
  try {
    const data = await readBinary(path)
    return { path, name: basename(path), size: data.byteLength, data }
  } catch (error) {
    console.error('[main] cannot read', path, error)
    return null
  }
}

export function registerIpcHandlers(): void {
  ipcMain.handle('pdf:app-info', () => ({
    version: app.getVersion(),
    platform: process.platform as 'win32' | 'darwin' | 'linux' | 'unknown',
    isPackaged: app.isPackaged,
    nativeTitleBarOverlay: process.platform === 'win32',
    updatesSupported: Boolean(process.env.PDF_UPDATE_FEED)
  }))

  ipcMain.handle('pdf:open-dialog', async (): Promise<OpenedFile | null> => {
    const win = getMainWindow()
    const result = await dialog.showOpenDialog(win ?? undefined!, {
      title: 'Deschide document PDF',
      properties: ['openFile'],
      filters: [{ name: 'Document PDF', extensions: ['pdf'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return openFileAt(result.filePaths[0])
  })

  ipcMain.handle('pdf:read-file', async (event, path: string): Promise<OpenedFile | null> => {
    // A compromised renderer must not be able to read arbitrary non-PDF files.
    if (event.sender !== getMainWindow()?.webContents || typeof path !== 'string' || extname(path).toLowerCase() !== '.pdf') return null
    return openFileAt(path)
  })

  ipcMain.handle(
    'pdf:save-file',
    async (_event, options: { defaultName: string; data: ArrayBuffer; title?: string }): Promise<SaveResult> => {
      const win = getMainWindow()
      const result = await dialog.showSaveDialog(win ?? undefined!, {
        title: options.title ?? 'Salvează document PDF',
        defaultPath: options.defaultName,
        filters: [{ name: 'Document PDF', extensions: ['pdf'] }]
      })
      if (result.canceled || !result.filePath) return { canceled: true }
      try {
        await writeBinary(result.filePath, options.data)
        return { path: result.filePath, canceled: false }
      } catch (error) {
        return { canceled: false, error: String(error) }
      }
    }
  )

  ipcMain.handle(
    'pdf:save-to',
    async (event, payload: { path: string; data: ArrayBuffer }): Promise<SaveResult> => {
      // Direct writes are reserved for explicit local QA capture, not normal PDFs.
      if (!process.env.PDF_CAPTURE_DIR || event.sender !== getMainWindow()?.webContents || extname(payload.path).toLowerCase() !== '.pdf') {
        return { canceled: false, error: 'Salvarea directă nu este disponibilă.' }
      }
      try {
        await writeBinary(payload.path, payload.data)
        return { path: payload.path, canceled: false }
      } catch (error) {
        return { canceled: false, error: String(error) }
      }
    }
  )

  ipcMain.handle('pdf:print', () => {
    getMainWindow()?.webContents.send('pdf:menu-action', 'print')
  })

  ipcMain.handle('pdf:titlebar-theme', (_event, options: { background: string; symbol: string }) => {
    const win = getMainWindow()
    if (!win || process.platform !== 'win32') return
    win.setTitleBarOverlay({
      color: options.background,
      symbolColor: options.symbol,
      height: 44
    })
  })

  ipcMain.handle('pdf:window-control', (_event, action: 'minimize' | 'maximize' | 'close') => {
    const win = getMainWindow()
    if (!win) return
    if (action === 'minimize') win.minimize()
    else if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize()
    else win.close()
  })

  ipcMain.handle('pdf:is-maximized', () => getMainWindow()?.isMaximized() ?? false)

  ipcMain.handle('pdf:open-external', (_event, url: string) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })

  ipcMain.handle('pdf:show-item', (_event, path: string) => {
    shell.showItemInFolder(path)
  })

  ipcMain.handle('pdf:check-updates', async () => {
    if (!process.env.PDF_UPDATE_FEED) {
      return {
        status: 'unsupported',
        message: 'Nu este configurat un furnizor de actualizări pentru această instalare.'
      }
    }
    try {
      const { autoUpdater } = await import('electron-updater')
      autoUpdater.autoDownload = false
      autoUpdater.autoInstallOnAppQuit = true
      const result = await autoUpdater.checkForUpdates()
      const version = result?.updateInfo?.version
      if (version && version !== app.getVersion()) {
        return { status: 'available', version, message: 'Este disponibilă o versiune nouă.' }
      }
      return { status: 'current', version: app.getVersion(), message: 'Aplicația este la zi.' }
    } catch (error) {
      return { status: 'error', message: String(error) }
    }
  })

  ipcMain.handle('pdf:reveal-path', (_event, path: string) => {
    shell.showItemInFolder(dirname(path))
  })
}
