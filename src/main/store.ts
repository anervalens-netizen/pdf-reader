import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { WindowState } from '../shared/api'

const stateFile = (): string => join(app.getPath('userData'), 'window-state.json')

const DEFAULT_STATE: WindowState = {
  width: 1320,
  height: 880,
  maximized: false
}

export function loadWindowState(): WindowState {
  try {
    const parsed = JSON.parse(readFileSync(stateFile(), 'utf-8')) as Partial<WindowState>
    return { ...DEFAULT_STATE, ...parsed }
  } catch {
    return { ...DEFAULT_STATE }
  }
}

export function saveWindowState(win?: Electron.BrowserWindow): void {
  if (!win || win.isDestroyed()) return
  const bounds = win.getNormalBounds()
  const state: WindowState = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    maximized: win.isMaximized()
  }
  try {
    writeFileSync(stateFile(), JSON.stringify(state), 'utf-8')
  } catch (error) {
    console.error('[main] could not persist window state', error)
  }
}

export async function readBinary(path: string): Promise<ArrayBuffer> {
  const buffer = await readFile(path)
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
}

export async function writeBinary(path: string, data: ArrayBuffer): Promise<void> {
  await writeFile(path, Buffer.from(data))
}
