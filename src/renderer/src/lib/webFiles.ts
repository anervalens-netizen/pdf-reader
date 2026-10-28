/**
 * Local file storage for the web / PWA build.
 *
 * A browser cannot reopen a file by path, so the bytes of every document
 * opened through the file picker are mirrored into IndexedDB under a synthetic
 * key. That keeps "recent documents", the reading session and the saved
 * annotations working in the browser and inside the Android shell.
 */
const DB_NAME = 'pdf-web-files'
const DB_VERSION = 1
const STORE = 'files'

export interface StoredFile {
  path: string
  name: string
  size: number
  data: ArrayBuffer
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'path' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return dbPromise
}

function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode)
        const request = action(transaction.objectStore(STORE))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
  )
}

export async function putFile(file: StoredFile): Promise<void> {
  try {
    await run('readwrite', (store) => store.put(file))
  } catch (error) {
    console.warn('[web-files] could not store file', error)
  }
}

export async function getFile(path: string): Promise<StoredFile | undefined> {
  try {
    return await run<StoredFile | undefined>('readonly', (store) => store.get(path))
  } catch {
    return undefined
  }
}

export async function deleteFile(path: string): Promise<void> {
  try {
    await run('readwrite', (store) => store.delete(path))
  } catch {
    /* ignore */
  }
}
