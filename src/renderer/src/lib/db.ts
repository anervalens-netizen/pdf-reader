import { api } from './api'

const DB_NAME = 'pdf'
const DB_VERSION = 1

export interface RecentRecord {
  path: string
  name: string
  size: number
  lastOpened: number
}

export interface SessionRecord {
  path: string
  page: number
  zoom: number
  zoomMode: 'custom' | 'fit-width' | 'fit-page'
  scrollTop: number
  updatedAt: number
}

export interface AnnotationRecord {
  path: string
  annotations: unknown[]
  updatedAt: number
}

type StoreName = 'recents' | 'sessions' | 'annotations'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('recents')) {
        const store = db.createObjectStore('recents', { keyPath: 'path' })
        store.createIndex('lastOpened', 'lastOpened')
      }
      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', { keyPath: 'path' })
      }
      if (!db.objectStoreNames.contains('annotations')) {
        db.createObjectStore('annotations', { keyPath: 'path' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return dbPromise
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode)
        const request = run(transaction.objectStore(store))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
  )
}

export async function getRecents(limit = 12): Promise<RecentRecord[]> {
  try {
    const all = await tx<RecentRecord[]>('recents', 'readonly', (store) => store.getAll())
    return all.sort((a, b) => b.lastOpened - a.lastOpened).slice(0, limit)
  } catch {
    return []
  }
}

export async function touchRecent(entry: Omit<RecentRecord, 'lastOpened'>): Promise<void> {
  try {
    const existing = await tx<RecentRecord | undefined>('recents', 'readonly', (store) => store.get(entry.path))
    const record: RecentRecord = { ...entry, lastOpened: Date.now() }
    if (existing) record.size = existing.size
    await tx('recents', 'readwrite', (store) => store.put(record))
  } catch (error) {
    console.warn('[db] could not persist recent', error)
  }
}

export async function removeRecent(path: string): Promise<void> {
  try {
    await tx('recents', 'readwrite', (store) => store.delete(path))
  } catch {
    /* ignore */
  }
}

export async function clearRecents(): Promise<void> {
  try {
    await tx('recents', 'readwrite', (store) => store.clear())
  } catch {
    /* ignore */
  }
}

export async function getSession(path: string): Promise<SessionRecord | undefined> {
  try {
    return await tx<SessionRecord | undefined>('sessions', 'readonly', (store) => store.get(path))
  } catch {
    return undefined
  }
}

export async function saveSession(record: SessionRecord): Promise<void> {
  try {
    await tx('sessions', 'readwrite', (store) => store.put(record))
  } catch (error) {
    console.warn('[db] could not persist session', error)
  }
}

export async function getAnnotations(path: string): Promise<unknown[] | undefined> {
  try {
    const record = await tx<AnnotationRecord | undefined>('annotations', 'readonly', (store) => store.get(path))
    return record?.annotations
  } catch {
    return undefined
  }
}

export async function saveAnnotations(path: string, annotations: unknown[]): Promise<void> {
  try {
    const record: AnnotationRecord = { path, annotations, updatedAt: Date.now() }
    await tx('annotations', 'readwrite', (store) => store.put(record))
  } catch (error) {
    console.warn('[db] could not persist annotations', error)
  }
}

/** Best-effort removal of a file from the recents list when it no longer exists. */
export async function pruneMissing(): Promise<void> {
  const recents = await getRecents(50)
  for (const recent of recents) {
    const exists = await api.readFile(recent.path).then(
      (file) => Boolean(file),
      () => false
    )
    if (!exists) await removeRecent(recent.path)
  }
}
