import { app, dialog, ipcMain, shell } from 'electron'
import { basename, dirname, extname, resolve, sep } from 'node:path'
import { getMainWindow } from './window'
import { readBinary, writeBinary } from './store'
import { authorizePdfPath, canReadPdfPath } from './pdfAccess'
import { printablePdf, safeHexColor, trustedSender } from './ipcSecurity'
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
  const allowed = (event: Parameters<typeof trustedSender>[0]): boolean => trustedSender(event, getMainWindow())
  ipcMain.handle('pdf:app-info', (event) => allowed(event) ? ({
    version: app.getVersion(),
    platform: process.platform as 'win32' | 'darwin' | 'linux' | 'unknown',
    isPackaged: app.isPackaged,
    nativeTitleBarOverlay: process.platform === 'win32',
    updatesSupported: app.isPackaged && (process.platform === 'win32' || Boolean(process.env.APPIMAGE))
  }) : null)

  ipcMain.handle('pdf:open-dialog', async (event): Promise<OpenedFile | null> => {
    if (!allowed(event)) return null
    const win = getMainWindow()
    const result = await dialog.showOpenDialog(win ?? undefined!, {
      title: 'Deschide document PDF',
      properties: ['openFile'],
      filters: [{ name: 'Document PDF', extensions: ['pdf'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    if (!authorizePdfPath(result.filePaths[0])) return null
    return openFileAt(result.filePaths[0])
  })

  ipcMain.handle('pdf:read-file', async (event, path: string): Promise<OpenedFile | null> => {
    // A compromised renderer must not be able to read arbitrary non-PDF files.
    if (!allowed(event) || !canReadPdfPath(path)) return null
    return openFileAt(path)
  })

  ipcMain.handle(
    'pdf:save-file',
    async (event, options: { defaultName: string; data: ArrayBuffer; title?: string }): Promise<SaveResult> => {
      if (!allowed(event) || !options || !printablePdf(options.data) ||
          typeof options.defaultName !== 'string' || options.defaultName.length > 240 ||
          !/^[^\\/:*?"<>|\x00-\x1f]+\.pdf$/i.test(options.defaultName)) {
        return { canceled: false, error: 'Fișierul PDF sau numele lui este invalid.' }
      }
      const win = getMainWindow()
      const result = await dialog.showSaveDialog(win ?? undefined!, {
        title: options.title ?? 'Salvează document PDF',
        defaultPath: options.defaultName,
        filters: [{ name: 'Document PDF', extensions: ['pdf'] }]
      })
      if (result.canceled || !result.filePath) return { canceled: true }
      try {
        await writeBinary(result.filePath, options.data)
        if (!authorizePdfPath(result.filePath)) {
          return { canceled: false, error: 'Copia a fost salvată, dar accesul din Recente nu a putut fi autorizat.' }
        }
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
      if (!allowed(event) || !process.env.PDF_CAPTURE_DIR || !printablePdf(payload?.data) || typeof payload?.path !== 'string' || extname(payload.path).toLowerCase() !== '.pdf' || !resolve(payload.path).startsWith(resolve(process.env.PDF_CAPTURE_DIR) + sep)) {
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

  ipcMain.handle('pdf:print', (event) => {
    if (!allowed(event)) return
    getMainWindow()?.webContents.send('pdf:menu-action', 'print')
  })

  ipcMain.handle('pdf:titlebar-theme', (event, options: { background: string; symbol: string }) => {
    if (!allowed(event) || !options || !safeHexColor(options.background) || !safeHexColor(options.symbol)) return
    const win = getMainWindow()
    if (!win || process.platform !== 'win32') return
    win.setTitleBarOverlay({
      color: options.background,
      symbolColor: options.symbol,
      height: 44
    })
  })

  ipcMain.handle('pdf:window-control', (event, action: 'minimize' | 'maximize' | 'close') => {
    if (!allowed(event) || !['minimize', 'maximize', 'close'].includes(action)) return
    const win = getMainWindow()
    if (!win) return
    if (action === 'minimize') win.minimize()
    else if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize()
    else win.close()
  })

  ipcMain.handle('pdf:is-maximized', (event) => allowed(event) ? getMainWindow()?.isMaximized() ?? false : false)

  ipcMain.handle('pdf:open-external', (event, url: string) => {
    if (!allowed(event) || typeof url !== 'string' || url.length > 2048) return
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') void shell.openExternal(parsed.toString())
    } catch { /* invalid address */ }
  })

  ipcMain.handle('pdf:show-item', (event, path: string) => {
    if (allowed(event) && canReadPdfPath(path)) shell.showItemInFolder(path)
  })

  ipcMain.handle('pdf:check-updates', async (event) => {
    if (!allowed(event)) return { status: 'error', message: 'Cerere neautorizată.' }
    if (!app.isPackaged || (process.platform !== 'win32' && !process.env.APPIMAGE)) {
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

  ipcMain.handle('pdf:download-update', async (event) => {
    if (!allowed(event)) return { status: 'error', message: 'Cerere neautorizată.' }
    if (!app.isPackaged || (process.platform !== 'win32' && !process.env.APPIMAGE)) {
      return { status: 'unsupported', message: 'Actualizarea automată nu este disponibilă pentru acest tip de instalare.' }
    }
    try {
      const { autoUpdater } = await import('electron-updater')
      autoUpdater.autoDownload = false
      autoUpdater.autoInstallOnAppQuit = true
      const result = await autoUpdater.checkForUpdates()
      if (!result || result.updateInfo.version === app.getVersion()) {
        return { status: 'current', version: app.getVersion(), message: 'Aplicația este la zi.' }
      }
      await autoUpdater.downloadUpdate()
      return { status: 'ready', version: result.updateInfo.version,
        message: 'Actualizarea a fost descărcată. Se instalează la închiderea aplicației.' }
    } catch (error) {
      return { status: 'error', message: 'Descărcarea actualizării a eșuat: ' + String(error) }
    }
  })

  ipcMain.handle('pdf:reveal-path', (event, path: string) => {
    if (allowed(event) && canReadPdfPath(path)) shell.showItemInFolder(dirname(path))
  })
}
