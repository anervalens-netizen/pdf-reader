import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { PdfApi, PdfAiApi, AppInfo, OpenedFile, Platform, SaveResult } from '../shared/api'

const api: PdfApi = {
  appInfo: (): Promise<AppInfo> => ipcRenderer.invoke('pdf:app-info'),
  platform: (): Platform => (process.platform as Platform) ?? 'unknown',
  openDialog: (): Promise<OpenedFile | null> => ipcRenderer.invoke('pdf:open-dialog'),
  readFile: (path: string): Promise<OpenedFile | null> => ipcRenderer.invoke('pdf:read-file', path),
  saveFile: (options): Promise<SaveResult> => ipcRenderer.invoke('pdf:save-file', options),
  saveTo: (path: string, data: ArrayBuffer): Promise<SaveResult> => ipcRenderer.invoke('pdf:save-to', { path, data }),
  print: (): Promise<void> => ipcRenderer.invoke('pdf:print'),
  setTitleBarTheme: (options): Promise<void> => ipcRenderer.invoke('pdf:titlebar-theme', options),
  windowControl: (action): Promise<void> => ipcRenderer.invoke('pdf:window-control', action),
  isMaximized: (): Promise<boolean> => ipcRenderer.invoke('pdf:is-maximized'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('pdf:open-external', url),
  showItemInFolder: (path: string): Promise<void> => ipcRenderer.invoke('pdf:show-item', path),
  checkForUpdates: (): Promise<{ status: string; version?: string; message?: string }> =>
    ipcRenderer.invoke('pdf:check-updates'),
  downloadUpdate: () => ipcRenderer.invoke('pdf:download-update'),
  onMenuAction: (handler: (action: string) => void): (() => void) => {
    const listener = (_event: unknown, action: string): void => handler(action)
    ipcRenderer.on('pdf:menu-action', listener)
    return () => ipcRenderer.removeListener('pdf:menu-action', listener)
  },
  rendererReady: (): void => ipcRenderer.send('pdf:renderer-ready'),
  onFileOpened: (handler: (payload: { path: string; name: string }) => void): (() => void) => {
    const listener = (_event: unknown, payload: { path: string; name: string }): void => handler(payload)
    ipcRenderer.on('pdf:file-opened', listener)
    return () => ipcRenderer.removeListener('pdf:file-opened', listener)
  }
}

contextBridge.exposeInMainWorld('pdf', api)

// Separate bridge; AI login and tokens are handled only in Electron main.
// The renderer sees account status and streamed answer text, never credentials.
const pdfAi: PdfAiApi = {
  status: () => ipcRenderer.invoke('pdf:ai-status'),
  signIn: () => ipcRenderer.invoke('pdf:ai-signin'),
  signOut: () => ipcRenderer.invoke('pdf:ai-signout'),
  models: () => ipcRenderer.invoke('pdf:ai-models'),
  ask: (request) => ipcRenderer.invoke('pdf:ai-ask', request),
  cancel: (id) => ipcRenderer.invoke('pdf:ai-cancel', id),
  onEvent: (handler) => {
    const listener = (_event: unknown, payload: Parameters<typeof handler>[0]): void => handler(payload)
    ipcRenderer.on('pdf:ai-event', listener)
    return () => ipcRenderer.removeListener('pdf:ai-event', listener)
  }
}
contextBridge.exposeInMainWorld('pdfAi', pdfAi)

// Drag & drop: only the preload can resolve the real path of a dropped file.
window.addEventListener('dragover', (event) => event.preventDefault())
window.addEventListener('drop', (event) => {
  event.preventDefault()
  const file = event.dataTransfer?.files?.[0]
  if (!file) return
  try {
    const path = webUtils.getPathForFile(file)
    if (path) ipcRenderer.send('pdf:file-dropped', path)
  } catch (error) {
    console.error('[preload] could not resolve dropped file', error)
  }
})
