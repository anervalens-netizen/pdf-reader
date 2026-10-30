import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import type { IpcMainEvent, IpcMainInvokeEvent, BrowserWindow } from 'electron'

type Sender = Pick<IpcMainEvent | IpcMainInvokeEvent, 'sender' | 'senderFrame'>

// Renderer bridge is only available to our top-level, application-owned page.
// A PDF subframe or compromised popup must not invoke native filesystem APIs.
export function trustedSender(event: Sender, win: BrowserWindow | null): boolean {
  if (!win || event.sender !== win.webContents || !event.senderFrame ||
      event.senderFrame !== win.webContents.mainFrame) return false
  const url = event.senderFrame.url
  const dev = process.env.ELECTRON_RENDERER_URL
  if (dev) {
    try {
      const candidate = new URL(url)
      const expected = new URL(dev)
      return candidate.origin === expected.origin && candidate.pathname === '/'
    } catch { return false }
  }
  if (!url.startsWith('file://')) return false
  try {
    const loaded = win.webContents.getURL()
    return loaded.startsWith('file://') &&
      resolve(fileURLToPath(url)) === resolve(fileURLToPath(loaded))
  } catch { return false }
}

export function printablePdf(data: unknown): data is ArrayBuffer {
  if (!(data instanceof ArrayBuffer) || data.byteLength < 8 ||
      data.byteLength > 200 * 1024 * 1024) return false
  const head = new TextDecoder('latin1').decode(new Uint8Array(data, 0, Math.min(1024, data.byteLength)))
  return head.includes('%PDF-')
}

export function safeHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}
