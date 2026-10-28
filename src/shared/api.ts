export type Platform = 'win32' | 'darwin' | 'linux' | 'unknown'

export interface OpenedFile {
  path: string
  name: string
  size: number
  data: ArrayBuffer
}

export interface RecentEntry {
  path: string
  name: string
  size: number
  lastOpened: number
  page?: number
  zoom?: number
}

export interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
}

export interface AppInfo {
  version: string
  platform: Platform
  isPackaged: boolean
  /** True when the OS draws the native window controls for us (Windows). */
  nativeTitleBarOverlay: boolean
  updatesSupported: boolean
}

export interface SaveResult {
  path?: string
  canceled: boolean
  error?: string
}

export interface PdfApi {
  appInfo(): Promise<AppInfo>
  platform(): Platform
  openDialog(): Promise<OpenedFile | null>
  readFile(path: string): Promise<OpenedFile | null>
  saveFile(options: { defaultName: string; data: ArrayBuffer; title?: string }): Promise<SaveResult>
  saveTo(path: string, data: ArrayBuffer): Promise<SaveResult>
  print(): Promise<void>
  setTitleBarTheme(options: { background: string; symbol: string }): Promise<void>
  windowControl(action: 'minimize' | 'maximize' | 'close'): Promise<void>
  isMaximized(): Promise<boolean>
  openExternal(url: string): Promise<void>
  showItemInFolder(path: string): Promise<void>
  checkForUpdates(): Promise<{ status: string; version?: string; message?: string }>
  onMenuAction(handler: (action: string) => void): () => void
  onFileOpened(handler: (payload: { path: string; name: string }) => void): () => void
  rendererReady(): void
}
