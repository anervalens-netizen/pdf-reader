import { app } from 'electron'
import { readFileSync, writeFileSync, renameSync, realpathSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

/**
 * The renderer is untrusted. Only file paths selected through an OS dialog,
 * launched by the OS, or dropped through the preload are eligible for reading.
 * Store approved paths across restarts so Recent Documents remains usable.
 */
const permitted = new Set<string>()
let loaded = false
const filename = (): string => join(app.getPath('userData'), 'approved-pdf-paths.json')

function canonical(path: unknown): string | null {
  if (typeof path !== 'string' || !path || path.length > 8192 || extname(path).toLowerCase() !== '.pdf') return null
  try {
    const resolved = realpathSync(path)
    if (!statSync(resolved).isFile()) return null
    return resolved
  } catch {
    return null
  }
}

function load(): void {
  if (loaded) return
  loaded = true
  try {
    const paths: unknown = JSON.parse(readFileSync(filename(), 'utf8'))
    if (Array.isArray(paths)) {
      for (const path of paths.slice(-500)) {
        const resolved = canonical(path)
        if (resolved) permitted.add(resolved)
      }
    }
  } catch { /* first launch or invalid persisted metadata */ }
}

export function authorizePdfPath(path: string): boolean {
  load()
  const resolved = canonical(path)
  if (!resolved) return false
  permitted.add(resolved)
  // Use an atomic replace and keep the previous file on any failure.
  try {
    const target = filename()
    const temp = target + '.tmp'
    writeFileSync(temp, JSON.stringify([...permitted].slice(-500)), { mode: 0o600 })
    renameSync(temp, target)
  } catch (error) {
    console.warn('[pdf-access] grant persistence failed', error)
    // Still allow the explicitly selected document for this session.
  }
  return true
}

export function canReadPdfPath(path: unknown): boolean {
  load()
  const resolved = canonical(path)
  return resolved !== null && permitted.has(resolved)
}
