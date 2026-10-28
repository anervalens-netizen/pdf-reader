import type { AppInfo, OpenedFile, PdfApi, SaveResult } from '../../../shared/api'
import { getFile, putFile } from './webFiles'
import { isNativeShell, savePdfOnAndroid } from './native'

declare const __APP_VERSION__: string

/** Minimal shape of the File System Access API handle we rely on. */
interface SaveFileHandle {
  name: string
  createWritable(): Promise<{
    write(data: Blob): Promise<void>
    close(): Promise<void>
  }>
}

interface SavePicker {
  (options: {
    suggestedName: string
    types: { description: string; accept: Record<string, string[]> }[]
  }): Promise<SaveFileHandle>
}

/** Synthetic key used in place of a real file system path. */
async function syntheticPath(data: ArrayBuffer): Promise<string> {
  // Content identity prevents unrelated PDFs with the same filename overwriting
  // each other, including their session data and annotations.
  const digest = await crypto.subtle.digest('SHA-256', data)
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `web:sha256:${hash}`
}

function baseName(path: string): string {
  const index = path.lastIndexOf('/')
  return index === -1 ? path : path.slice(index + 1)
}

/** Opens the system file picker. Resolves with null when the user cancels. */
function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/pdf,.pdf'
    input.style.position = 'fixed'
    input.style.left = '-10000px'
    document.body.appendChild(input)

    let settled = false
    const finish = (file: File | null): void => {
      if (settled) return
      settled = true
      input.remove()
      resolve(file)
    }

    input.addEventListener('change', () => finish(input.files?.[0] ?? null))
    // Chromium and Firefox fire `cancel` when the dialog is dismissed.
    input.addEventListener('cancel', () => finish(null))
    input.click()
  })
}

/** Triggers a plain browser download, used when the save picker is unavailable. */
function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 20_000)
}

/**
 * Converts a `File` picked in the browser into an `OpenedFile` and mirrors its
 * bytes into IndexedDB, so the document can be reopened from the recents list.
 */
export async function fileToRecord(file: File): Promise<OpenedFile> {
  const data = await file.arrayBuffer()
  const record: OpenedFile = {
    path: await syntheticPath(data),
    name: file.name,
    size: file.size,
    data
  }
  await putFile(record)
  return record
}

/**
 * Browser implementation of the `PdfApi` contract.
 *
 * It is used by the PWA build and by the Android shell, where there is no
 * Electron preload to provide `window.pdf`. Capabilities that only exist on
 * the desktop (window controls, native menus, updates) degrade to no-ops.
 */
export const webApi: PdfApi = {
  async appInfo(): Promise<AppInfo> {
    return {
      version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0',
      platform: 'unknown',
      isPackaged: false,
      nativeTitleBarOverlay: false,
      updatesSupported: false
    }
  },

  platform: () => 'unknown',
  rendererReady: () => { /* browser has no OS launch queue */ },

  async openDialog(): Promise<OpenedFile | null> {
    const file = await pickFile()
    if (!file) return null
    return fileToRecord(file)
  },

  async readFile(path: string): Promise<OpenedFile | null> {
    const stored = await getFile(path)
    if (!stored) return null
    return { path: stored.path, name: stored.name, size: stored.size, data: stored.data }
  },

  async saveFile(options: { defaultName: string; data: ArrayBuffer; title?: string }): Promise<SaveResult> {
    if (isNativeShell()) {
      // WebView downloads are unreliable on Android; use the system's SAF
      // Create Document picker instead of reporting a fictitious success.
      try {
        return await savePdfOnAndroid(options.defaultName, options.data)
      } catch (error) {
        return { canceled: false, error: `Salvarea Android a eșuat: ${String(error)}` }
      }
    }
    const blob = new Blob([options.data], { type: 'application/pdf' })
    const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker

    if (typeof picker === 'function') {
      try {
        const handle = await picker({
          suggestedName: options.defaultName,
          types: [{ description: 'Document PDF', accept: { 'application/pdf': ['.pdf'] } }]
        })
        const writable = await handle.createWritable()
        await writable.write(blob)
        await writable.close()
        return { path: handle.name, canceled: false }
      } catch (error) {
        if ((error as { name?: string }).name === 'AbortError') return { canceled: true }
        // The picker can be blocked (no user gesture, insecure context);
        // fall back to a normal download instead of failing the save.
        console.warn('[web] save picker unavailable, downloading instead', error)
      }
    }

    downloadBlob(blob, options.defaultName)
    return { canceled: false }
  },

  async saveTo(path: string, data: ArrayBuffer): Promise<SaveResult> {
    const record = {
      path,
      name: baseName(path),
      size: data.byteLength,
      data
    }
    await putFile(record)
    return { path, canceled: false }
  },

  async print(): Promise<void> {
    window.print()
  },

  async setTitleBarTheme(): Promise<void> {
    /* no native title bar in the browser */
  },

  async windowControl(): Promise<void> {
    /* no native window in the browser */
  },

  async isMaximized(): Promise<boolean> {
    return false
  },

  async openExternal(url: string): Promise<void> {
    window.open(url, '_blank', 'noopener,noreferrer')
  },

  async showItemInFolder(): Promise<void> {
    /* no file system to reveal */
  },

  async checkForUpdates(): Promise<{ status: string; version?: string; message?: string }> {
    return { status: 'unsupported', message: 'Actualizările automate sunt disponibile doar pe desktop.' }
  },

  onMenuAction(): () => void {
    return () => {}
  },

  onFileOpened(): () => void {
    return () => {}
  }
}
