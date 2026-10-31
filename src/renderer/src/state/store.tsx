import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode
} from 'react'
import { api } from '../lib/api'
import * as db from '../lib/db'
import { fileToRecord } from '../lib/webApi'
import { isNativeShell } from '../lib/native'
import { printPdfBlob } from '../lib/printPdf'
import { printCopyOfProtectedPdf } from '../lib/printProtectedPdf'
import { EditHistory } from '../lib/editHistory'
import { loadDocument, type PDFDocumentProxy } from '../lib/pdf'
import { buildPageIndex, findMatches } from '../lib/textIndex'
import { fontForFormValues } from '../lib/unicodeFormFont'
import { extractPdfPages, mergePdfDocuments, parsePageRange, rotatePdfPage, splitPdfAt } from '../lib/pageTools'
import type { TextItemLike } from '../lib/geometry'
import {
  createId,
  exportAnnotatedPdf,
  type Annotation
} from '../lib/annotations'

export type Theme = 'light' | 'dark' | 'system'
export type Tool = 'select' | 'highlight' | 'underline' | 'note' | 'draw' | 'signature' | 'text'
export type SidebarTab = 'thumbnails' | 'outline'
export type ZoomMode = 'custom' | 'fit-width' | 'fit-page'
export type PageOperation = 'rotate' | 'extract' | 'merge' | 'split'

export interface FileRef {
  path: string
  name: string
  size: number
}

export interface SearchHit {
  page: number
  start: number
  end: number
}

export interface OutlineNode {
  title: string
  page: number
  children: OutlineNode[]
}

export interface Toast {
  id: string
  message: string
  tone: 'info' | 'success' | 'error'
}

export interface AppState {
  theme: Theme
  file: FileRef | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  needsPassword: boolean
  numPages: number
  page: number
  zoom: number
  zoomMode: ZoomMode
  sidebarOpen: boolean
  sidebarTab: SidebarTab
  tool: Tool
  color: string
  annotations: Annotation[]
  history: { undo: number; redo: number }
  outline: OutlineNode[] | null
  searchOpen: boolean
  query: string
  hits: SearchHit[]
  hitIndex: number
  searching: boolean
  recents: db.RecentRecord[]
  saving: boolean
  printing: boolean
  toasts: Toast[]
}

const initialState: AppState = {
  theme: (localStorage.getItem('pdf.theme') as Theme) ?? 'system',
  file: null,
  status: 'idle',
  error: null,
  needsPassword: false,
  numPages: 0,
  page: 1,
  zoom: 1,
  zoomMode: 'fit-width',
  sidebarOpen: !window.matchMedia('(max-width: 900px)').matches && localStorage.getItem('pdf.sidebar') !== 'hidden',
  sidebarTab: 'thumbnails',
  tool: 'select',
  color: '#ffd94a',
  annotations: [],
  history: { undo: 0, redo: 0 },
  outline: null,
  searchOpen: false,
  query: '',
  hits: [],
  hitIndex: -1,
  searching: false,
  recents: [],
  saving: false,
  printing: false,
  toasts: []
}

type Action =
  | { type: 'theme/set'; theme: Theme }
  | { type: 'file/loading'; file: FileRef }
  | { type: 'file/opened'; file: FileRef; numPages: number; outline: OutlineNode[] | null }
  | { type: 'file/error'; message: string }
  | { type: 'file/needs-password' }
  | { type: 'file/closed' }
  | { type: 'page/set'; page: number }
  | { type: 'zoom/set'; zoom: number; mode: ZoomMode }
  | { type: 'sidebar/set'; open: boolean }
  | { type: 'sidebar/tab'; tab: SidebarTab }
  | { type: 'tool/set'; tool: Tool }
  | { type: 'color/set'; color: string }
  | { type: 'annotations/set'; annotations: Annotation[] }
  | { type: 'annotations/add'; annotation: Annotation }
  | { type: 'annotations/remove'; id: string }
  | { type: 'history/set'; counts: { undo: number; redo: number } }
  | { type: 'outline/set'; outline: OutlineNode[] | null }
  | { type: 'search/toggle'; open: boolean }
  | { type: 'search/query'; query: string }
  | { type: 'search/hits'; hits: SearchHit[]; index: number }
  | { type: 'search/close' }
  | { type: 'search/progress'; searching: boolean }
  | { type: 'recents/set'; recents: db.RecentRecord[] }
  | { type: 'saving/set'; saving: boolean }
  | { type: 'printing/set'; printing: boolean }
  | { type: 'toast/add'; toast: Toast }
  | { type: 'toast/remove'; id: string }

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'theme/set':
      return { ...state, theme: action.theme }
    case 'file/loading':
      return {
        ...state, file: action.file, status: 'loading', error: null,
        needsPassword: false, annotations: [], outline: null,
        numPages: 0, page: 1, history: { undo: 0, redo: 0 },
        hits: [], hitIndex: -1, query: '', searchOpen: false
      }
    case 'file/opened':
      return {
        ...state,
        status: 'ready',
        file: action.file,
        numPages: action.numPages,
        outline: action.outline,
        page: 1,
        annotations: [],
        hits: [],
        hitIndex: -1,
        query: '',
        searchOpen: false
      }
    case 'file/error':
      return { ...state, status: 'error', error: action.message }
    case 'file/needs-password':
      return { ...state, status: 'error', needsPassword: true }
    case 'file/closed':
      return {
        ...state,
        file: null,
        status: 'idle',
        numPages: 0,
        page: 1,
        annotations: [],
        outline: null,
        hits: [],
        hitIndex: -1,
        query: '',
        searchOpen: false,
        error: null,
        needsPassword: false
      }
    case 'page/set':
      return { ...state, page: action.page }
    case 'zoom/set':
      return { ...state, zoom: action.zoom, zoomMode: action.mode }
    case 'sidebar/set':
      return { ...state, sidebarOpen: action.open }
    case 'sidebar/tab':
      return { ...state, sidebarTab: action.tab }
    case 'tool/set':
      return { ...state, tool: action.tool }
    case 'color/set':
      return { ...state, color: action.color }
    case 'annotations/set':
      return { ...state, annotations: action.annotations }
    case 'history/set':
      return { ...state, history: action.counts }
    case 'annotations/add':
      return { ...state, annotations: [...state.annotations, action.annotation] }
    case 'annotations/remove':
      return { ...state, annotations: state.annotations.filter((item) => item.id !== action.id) }
    case 'outline/set':
      return { ...state, outline: action.outline }
    case 'search/toggle':
      return { ...state, searchOpen: action.open, query: action.open ? state.query : '' }
    case 'search/query':
      return { ...state, query: action.query }
    case 'search/hits':
      return { ...state, hits: action.hits, hitIndex: action.index }
    case 'search/close':
      return { ...state, searchOpen: false, query: '', hits: [], hitIndex: -1 }
    case 'search/progress':
      return { ...state, searching: action.searching }
    case 'recents/set':
      return { ...state, recents: action.recents }
    case 'saving/set':
      return { ...state, saving: action.saving }
    case 'printing/set':
      return { ...state, printing: action.printing }
    case 'toast/add':
      return { ...state, toasts: [...state.toasts.slice(-3), action.toast] }
    case 'toast/remove':
      return { ...state, toasts: state.toasts.filter((toast) => toast.id !== action.id) }
    default:
      return state
  }
}

export interface AppContextValue {
  state: AppState
  dispatch: React.Dispatch<Action>
  docRef: React.MutableRefObject<PDFDocumentProxy | null>
  dataRef: React.MutableRefObject<ArrayBuffer | null>
  toast: (message: string, tone?: Toast['tone']) => void
  openDialog: () => Promise<void>
  openPath: (path: string, password?: string) => Promise<void>
  /** Opens a file dropped on the window (browser builds only). */
  openFile: (file: File) => Promise<void>
  closeDocument: () => void
  setPage: (page: number) => void
  setZoom: (zoom: number, mode?: ZoomMode) => void
  zoomBy: (factor: number) => void
  fitWidth: () => void
  fitPage: () => void
  toggleSidebar: () => void
  setTool: (tool: Tool) => void
  setColor: (color: string) => void
  addAnnotation: (annotation: Annotation) => void
  removeAnnotation: (id: string) => void
  updateAnnotation: (annotation: Annotation) => void
  undoAnnotation: () => void
  redoAnnotation: () => void
  clearAnnotations: () => void
  runSearch: (query: string) => Promise<void>
  goToHit: (delta: number) => void
  jumpToHit: (index: number) => void
  saveCopy: () => Promise<void>
  pageOperation: (operation: PageOperation, selection?: string) => Promise<boolean>
  print: () => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [state, dispatch] = useReducer(reducer, initialState)
  const docRef = useRef<PDFDocumentProxy | null>(null)
  const dataRef = useRef<ArrayBuffer | null>(null)
  const searchToken = useRef(0)
  const printInProgress = useRef(false)
  const printAbortRef = useRef<AbortController | null>(null)
  // Increased before each document load/close, independent of search events.
  const documentEpoch = useRef(0)
  const annotationsRef = useRef<Annotation[]>([])
  const historyRef = useRef(new EditHistory())
  const annotationPathRef = useRef<string | null>(null)
  const annotationWritesRef = useRef<Map<string, Promise<void>>>(new Map())

  const toast = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    const id = createId('toast')
    dispatch({ type: 'toast/add', toast: { id, message, tone } })
    window.setTimeout(() => dispatch({ type: 'toast/remove', id }), 4200)
  }, [])

  // Serialize writes by document to avoid older snapshots overwriting newer
  // annotations when several strokes arrive before an IndexedDB transaction
  // commits. Surface quota/transaction failures to the user.
  const queueAnnotations = useCallback((path: string, next: Annotation[]): void => {
    const writes = annotationWritesRef.current
    const prior = writes.get(path) ?? Promise.resolve()
    const write = prior.catch(() => {}).then(() => db.saveAnnotations(path, next))
    writes.set(path, write)
    void write.catch((error) => {
      console.error('[annotations] persistence failed', error)
      toast('Notițele nu au fost salvate local. Salvează imediat o copie PDF.', 'error')
    }).finally(() => {
      if (writes.get(path) === write) writes.delete(path)
    })
  }, [toast])

  const applyTheme = useCallback((theme: Theme) => {
    const resolved =
      theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : theme
    document.documentElement.dataset.theme = resolved
    const colors =
      resolved === 'dark'
        ? { background: '#141413', symbol: '#e7e4de' }
        : { background: '#f7f5f2', symbol: '#2a2926' }
    void api.setTitleBarTheme(colors)
  }, [])

  useEffect(() => {
    applyTheme(state.theme)
    localStorage.setItem('pdf.theme', state.theme)
  }, [state.theme, applyTheme])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const listener = (): void => applyTheme(state.theme)
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [state.theme, applyTheme])

  const refreshRecents = useCallback(async () => {
    const recents = await db.getRecents()
    dispatch({ type: 'recents/set', recents })
  }, [])

  useEffect(() => {
    void refreshRecents()
    void db.pruneMissing().then(refreshRecents)
  }, [refreshRecents])

  const loadFile = useCallback(
    async (file: { path: string; name: string; size: number; data: ArrayBuffer }, password?: string) => {
      // A pending password prompt must never be paired with the previous PDF.
      const epoch = ++documentEpoch.current
      printAbortRef.current?.abort()
      searchToken.current += 1
      const previous = docRef.current
      docRef.current = null
      dataRef.current = null
      annotationPathRef.current = null
      annotationsRef.current = []
      historyRef.current.reset()
      if (previous) void previous.cleanup()
      dispatch({ type: 'file/loading', file: { path: file.path, name: file.name, size: file.size } })
      try {
        // PDF.js transfers its input ArrayBuffer to the worker, detaching it.
        // Keep the original bytes intact for Save Copy and page operations.
        const doc = await loadDocument(file.data.slice(0), { password })
        if (epoch !== documentEpoch.current) {
          void doc.cleanup()
          return
        }
        docRef.current = doc
        dataRef.current = file.data

        let outline: OutlineNode[] | null = null
        try {
          const raw = await doc.getOutline()
          if (raw) {
            outline = await Promise.all(
              raw.map(async (item) => ({
                title: item.title,
                page: await resolveOutlinePage(doc, item.dest),
                children: []
              }))
            )
          }
        } catch {
          outline = null
        }

        // Drain queued writes before reading; otherwise an older snapshot can
        // overwrite edits made just before reopening this document.
        const pendingAnnotations = annotationWritesRef.current.get(file.path)
        if (pendingAnnotations) await pendingAnnotations
        const stored = (await db.getAnnotations(file.path)) as Annotation[] | undefined
        if (epoch !== documentEpoch.current || docRef.current !== doc) return
        annotationPathRef.current = file.path
        historyRef.current.reset()
        dispatch({ type: 'history/set', counts: historyRef.current.counts })
        annotationsRef.current = stored ?? []
        dispatch({
          type: 'file/opened',
          file: { path: file.path, name: file.name, size: file.size },
          numPages: doc.numPages,
          outline
        })
        if (stored?.length) dispatch({ type: 'annotations/set', annotations: stored })

        await db.touchRecent({ path: file.path, name: file.name, size: file.size })
        if (epoch !== documentEpoch.current) return
        await refreshRecents()

        const session = await db.getSession(file.path)
        if (epoch !== documentEpoch.current) return
        if (session) {
          dispatch({ type: 'page/set', page: session.page })
          // Only a custom zoom is restored; fit modes are recomputed for the
          // current window size so the page always fits the reading area.
          if (session.zoomMode === 'custom') {
            dispatch({ type: 'zoom/set', zoom: session.zoom, mode: 'custom' })
          }
        }
      } catch (error) {
        if (epoch !== documentEpoch.current) return
        const err = error as { name?: string; message?: string }
        if (err?.name === 'PasswordException') {
          dispatch({ type: 'file/needs-password' })
          return
        }
        dispatch({ type: 'file/error', message: err?.message ?? 'Documentul nu a putut fi deschis.' })
      }
    },
    [refreshRecents]
  )

  const openDialog = useCallback(async () => {
    try {
      const file = await api.openDialog()
      if (!file) return
      await loadFile(file)
    } catch (error) {
      console.error('[open] document storage failed', error)
      toast('Documentul nu a putut fi stocat local. Verifică spațiul disponibil sau permisiunile.', 'error')
    }
  }, [loadFile, toast])

  const openPath = useCallback(
    async (path: string, password?: string) => {
      const file = await api.readFile(path)
      if (!file) {
        toast('Fișierul nu a mai există sau nu poate fi citit.', 'error')
        return
      }
      await loadFile(file, password)
    },
    [loadFile, toast]
  )

  // Drag & drop on the web/Android builds: the browser hands over the bytes,
  // so the document is mirrored locally to keep the recents list working.
  const openFile = useCallback(
    async (file: File) => {
      try {
        const record = await fileToRecord(file)
        await loadFile(record)
      } catch (error) {
        console.error('[open] failed', error)
        toast('Documentul nu a putut fi deschis.', 'error')
      }
    },
    [loadFile, toast]
  )

  const closeDocument = useCallback(() => {
    documentEpoch.current += 1
    printAbortRef.current?.abort()
    searchToken.current += 1
    void docRef.current?.cleanup()
    docRef.current = null
    dataRef.current = null
    annotationPathRef.current = null
    annotationsRef.current = []
    historyRef.current.reset()
    dispatch({ type: 'history/set', counts: historyRef.current.counts })
    dispatch({ type: 'file/closed' })
  }, [])

  const setPage = useCallback((page: number) => {
    dispatch({ type: 'page/set', page: Math.max(1, Math.round(page)) })
  }, [])

  const setZoom = useCallback((zoom: number, mode: ZoomMode = 'custom') => {
    dispatch({ type: 'zoom/set', zoom: Math.min(10, Math.max(0.1, zoom)), mode })
  }, [])

  const zoomBy = useCallback(
    (factor: number) => {
      dispatch({ type: 'zoom/set', zoom: Math.min(10, Math.max(0.1, state.zoom * factor)), mode: 'custom' })
    },
    [state.zoom]
  )

  const toggleSidebar = useCallback(() => {
    dispatch({ type: 'sidebar/set', open: !state.sidebarOpen })
  }, [state.sidebarOpen])

  const setTool = useCallback((tool: Tool) => dispatch({ type: 'tool/set', tool }), [])
  const setColor = useCallback((color: string) => dispatch({ type: 'color/set', color }), [])

  const persistAnnotations = useCallback((next: Annotation[], recordHistory: boolean) => {
    const before = annotationsRef.current
    if (before === next || !annotationPathRef.current) return
    if (recordHistory) historyRef.current.record(before, next)
    annotationsRef.current = next
    dispatch({ type: 'annotations/set', annotations: next })
    dispatch({ type: 'history/set', counts: historyRef.current.counts })
    queueAnnotations(annotationPathRef.current, next)
  }, [queueAnnotations])

  const addAnnotation = useCallback((annotation: Annotation) => {
    persistAnnotations([...annotationsRef.current, annotation], true)
  }, [persistAnnotations])

  const updateAnnotation = useCallback((annotation: Annotation) => {
    const old = annotationsRef.current.find((item) => item.id === annotation.id)
    if (!old || old.type !== annotation.type) return
    persistAnnotations(annotationsRef.current.map((item) => item.id === annotation.id ? annotation : item), true)
  }, [persistAnnotations])

  const removeAnnotation = useCallback((id: string) => {
    if (!annotationsRef.current.some((item) => item.id === id)) return
    persistAnnotations(annotationsRef.current.filter((item) => item.id !== id), true)
  }, [persistAnnotations])

  const clearAnnotations = useCallback(() => {
    if (annotationsRef.current.length) persistAnnotations([], true)
  }, [persistAnnotations])

  const undoAnnotation = useCallback(() => {
    const previous = historyRef.current.undo(annotationsRef.current)
    if (previous) persistAnnotations(previous, false)
  }, [persistAnnotations])

  const redoAnnotation = useCallback(() => {
    const next = historyRef.current.redo(annotationsRef.current)
    if (next) persistAnnotations(next, false)
  }, [persistAnnotations])

  const runSearch = useCallback(
    async (query: string) => {
      const doc = docRef.current
      dispatch({ type: 'search/query', query })
      if (!doc || !query.trim()) {
        dispatch({ type: 'search/hits', hits: [], index: -1 })
        return
      }
      const token = ++searchToken.current
      dispatch({ type: 'search/progress', searching: true })
      const hits: SearchHit[] = []
      try {
        for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
          if (searchToken.current !== token) return
          const page = await doc.getPage(pageNumber)
          const content = await page.getTextContent()
          const items = content.items.filter((item) => 'str' in item) as TextItemLike[]
          const index = buildPageIndex(items)
          for (const match of findMatches(index.text, query.trim())) {
            hits.push({ page: pageNumber, start: match.start, end: match.end })
          }
          page.cleanup()
          if (pageNumber % 25 === 0) await new Promise((resolve) => setTimeout(resolve, 0))
        }
      } catch (error) {
        console.warn('[search] failed', error)
      }
      if (searchToken.current !== token) return
      dispatch({ type: 'search/hits', hits, index: hits.length ? 0 : -1 })
      dispatch({ type: 'search/progress', searching: false })
    },
    []
  )

  const goToHit = useCallback(
    (delta: number) => {
      if (state.hits.length === 0) return
      const next = (state.hitIndex + delta + state.hits.length) % state.hits.length
      dispatch({ type: 'search/hits', hits: state.hits, index: next })
      dispatch({ type: 'page/set', page: state.hits[next].page })
    },
    [state.hits, state.hitIndex]
  )

  const jumpToHit = useCallback(
    (index: number) => {
      if (index < 0 || index >= state.hits.length) return
      dispatch({ type: 'search/hits', hits: state.hits, index })
      dispatch({ type: 'page/set', page: state.hits[index].page })
    },
    [state.hits]
  )

  const collectFormValues = useCallback(async () => {
    const doc = docRef.current
    if (!doc) return []
    const values: { name: string; type: string; value: string | boolean }[] = []
    const seen = new Set<string>()
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber)
      const annotations = await page.getAnnotations()
      for (const annotation of annotations) {
        const fieldName = (annotation as { fieldName?: string }).fieldName
        const fieldType = (annotation as { fieldType?: string }).fieldType
        const id = (annotation as { id?: string }).id
        if (!fieldName || !fieldType || !id || seen.has(fieldName)) continue
        const stored = doc.annotationStorage.getValue(id, {}) as { value?: unknown }
        if (!stored || stored.value === undefined || stored.value === null) continue
        seen.add(fieldName)
        values.push({
          name: fieldName,
          type: fieldType,
          value:
            typeof stored.value === 'boolean' || typeof stored.value === 'string'
              ? stored.value
              : String(stored.value)
        })
      }
      page.cleanup()
    }
    return values
  }, [])

  const saveCopy = useCallback(async () => {
    const doc = docRef.current
    const file = state.file
    const data = dataRef.current
    if (!doc || !file || !data || state.status !== 'ready') return

    dispatch({ type: 'saving/set', saving: true })
    try {
      const pendingWrite = annotationWritesRef.current.get(file.path)
      if (pendingWrite) {
        try { await pendingWrite } catch {
          toast('Salvarea adnotărilor locale a eșuat; se exportă copia din memorie.', 'error')
        }
      }
      const formValues = await collectFormValues()
      const annotations = annotationPathRef.current === file.path ? annotationsRef.current : state.annotations
      const unicodeFontBytes = await fontForFormValues([...formValues, { name: '__pdf_editor_text__', type: 'text', value: annotations.filter((a) => a.type === 'text').map((a) => a.text).join('\\n') }])
      const result = await exportAnnotatedPdf(data, annotations, { formValues, unicodeFontBytes })
      if (result.warnings.some((warning) => warning.includes('Textul nu a fost exportat'))) {
        throw new Error('Caseta de text conține caractere care nu se pot exporta. Corectează textul înainte de salvare.')
      }
      const baseName = file.name.replace(/\.pdf$/i, '')
      const saved = await api.saveFile({
        defaultName: state.annotations.length ? `${baseName}-adnotat.pdf` : file.name,
        data: result.data,
        title: 'Salvează o copie'
      })
      if (saved.canceled) return
      if (saved.error) {
        toast('Salvarea a eșuat.', 'error')
        return
      }
      if (result.warnings.length) {
        console.warn('[save] export warnings', result.warnings)
        toast(`Copie salvată, dar ${result.warnings.length} element(e) necesită verificare.`, 'error')
      } else {
        toast(state.annotations.length ? `Salvat cu ${state.annotations.length} adnotări.` : 'Copie salvată.', 'success')
      }
      // Browser/Android save locations are not reusable IndexedDB paths.
      if (saved.path && api.platform() !== 'unknown') {
        await db.touchRecent({ path: saved.path, name: saved.path.split(/[\\/]/).pop() ?? file.name, size: result.data.byteLength })
      }
      await refreshRecents()
    } catch (error) {
      console.error('[save] failed', error)
      toast('Salvarea a eșuat: ' + String(error), 'error')
    } finally {
      dispatch({ type: 'saving/set', saving: false })
    }
  }, [state.file, state.annotations, collectFormValues, toast, refreshRecents])

  const pageOperation = useCallback(async (operation: PageOperation, selection = ''): Promise<boolean> => {
    const file = state.file
    const source = dataRef.current
    if (!file || !source || state.saving || state.status !== 'ready') return false
    const epoch = documentEpoch.current
    dispatch({ type: 'saving/set', saving: true })
    try {
      // Browsers require transient user activation to open a file picker.
      // Call it directly from the initiating click, before ANY async PDF work.
      const mergeFile = operation === 'merge' ? await api.openDialog() : null
      if (operation === 'merge' && !mergeFile) return false
      const pending = annotationWritesRef.current.get(file.path)
      if (pending) await pending
      const values = await collectFormValues()
      if (documentEpoch.current !== epoch) throw new Error('Documentul s-a schimbat în timpul operației.')
      const annotations = annotationPathRef.current === file.path ? annotationsRef.current : state.annotations
      const unicodeFontBytes = await fontForFormValues([...values, { name: '__pdf_editor_text__', type: 'text', value: annotations.filter((a) => a.type === 'text').map((a) => a.text).join('\\n') }])
      const prepared = await exportAnnotatedPdf(source, annotations, { formValues: values, unicodeFontBytes })
      if (prepared.warnings.some((warning) => warning.includes('Textul nu a fost exportat'))) {
        throw new Error('Operația a fost oprită: caseta de text conține caractere incompatibile.')
      }
      const base = file.name.replace(/\.pdf$/i, '')
      const save = async (data: ArrayBuffer, name: string): Promise<boolean> => {
        const saved = await api.saveFile({ defaultName: name, data, title: 'Salvează un PDF nou' })
        if (saved.error) throw new Error(saved.error)
        if (saved.canceled) return false
        if (saved.path && api.platform() !== 'unknown') {
          await db.touchRecent({ path: saved.path, name, size: data.byteLength })
          await refreshRecents()
        }
        return true
      }
      let complete = false
      if (operation === 'rotate') {
        const data = await rotatePdfPage(prepared.data, state.page)
        complete = await save(data, `${base}-rotit-p${state.page}.pdf`)
      } else if (operation === 'extract') {
        const pages = parsePageRange(selection, state.numPages)
        const data = await extractPdfPages(prepared.data, pages)
        complete = await save(data, `${base}-extras.pdf`)
      } else if (operation === 'merge') {
        if (!mergeFile) return false
        const data = await mergePdfDocuments([prepared.data, mergeFile.data])
        complete = await save(data, `${base}-combinat.pdf`)
      } else if (operation === 'split') {
        const afterPage = Number(selection.trim())
        const [left, right] = await splitPdfAt(prepared.data, afterPage)
        const first = await save(left, `${base}-partea-1.pdf`)
        if (!first) return false
        try {
          const second = await save(right, `${base}-partea-2.pdf`)
          if (!second) {
            toast('Prima parte a fost salvată. A doua parte a fost anulată.', 'info')
            return false
          }
          complete = true
        } catch (error) {
          toast('Prima parte a fost salvată, dar a doua a eșuat: ' + String(error), 'error')
          return false
        }
      }
      if (complete) {
        if (prepared.warnings.length) {
          toast('PDF salvat. Verifică avertizările pentru formulare și semnăturile digitale.', 'info')
        } else {
          toast('PDF nou salvat. Originalul nu a fost modificat.', 'success')
        }
      }
      return complete
    } catch (error) {
      console.error('[page-tools] failed', error)
      toast('Operația pe pagini a eșuat: ' + String(error), 'error')
      return false
    } finally {
      dispatch({ type: 'saving/set', saving: false })
    }
  }, [state.file, state.page, state.numPages, state.annotations, state.saving, collectFormValues, refreshRecents, toast])

  const print = useCallback(() => {
    const doc = docRef.current
    const file = state.file
    if (printInProgress.current || !doc || !file || state.status !== 'ready') return
    if (isNativeShell()) {
      toast('Pe Android, salvează o copie și imprim-o din aplicația sistemului.', 'info')
      return
    }
    const epoch = documentEpoch.current
    const source = dataRef.current
    if (!source) return
    const controller = new AbortController()
    printAbortRef.current = controller
    const ensureCurrent = (): void => {
      if (controller.signal.aborted || epoch !== documentEpoch.current || docRef.current !== doc) {
        throw new Error('Documentul s-a schimbat în timpul pregătirii imprimării.')
      }
    }
    printInProgress.current = true
    dispatch({ type: 'printing/set', printing: true })
    void (async () => {
      const pending = annotationWritesRef.current.get(file.path)
      if (pending) await pending
      ensureCurrent()
      const values = await collectFormValues()
      ensureCurrent()
      const annotations = [...annotationsRef.current]
      const unicodeFontBytes = await fontForFormValues([...values, {
        name: '__pdf_editor_text__', type: 'text',
        value: annotations.filter((a) => a.type === 'text').map((a) => a.text).join('\n')
      }])
      ensureCurrent()
      let output: ArrayBuffer
      try {
        const exported = await exportAnnotatedPdf(source, annotations, { formValues: values, unicodeFontBytes })
        ensureCurrent()
        if (exported.warnings.some((warning) => warning.includes('Textul nu a fost exportat'))) {
          throw new Error('Imprimarea a fost oprită: caseta de text conține caractere neacceptate.')
        }
        if (exported.warnings.length) toast('Imprimare: ' + exported.warnings[0], 'error')
        output = exported.data
      } catch (error) {
        ensureCurrent()
        // pdf-lib cannot decrypt PDF files. PDF.js has already decrypted the
        // opened document with the user's password: render a new print copy.
        if (!/encrypted/i.test(String(error))) throw error
        toast('PDF protejat: imprimare rasterizată la 144 dpi. Originalul rămâne intact.', 'info')
        output = await printCopyOfProtectedPdf(doc, annotations, controller.signal)
        ensureCurrent()
      }
      ensureCurrent()
      await printPdfBlob(output, controller.signal)
    })().catch((error) => {
      if (controller.signal.aborted) return
      console.error('[print] PDF print failed', error)
      toast('Imprimarea nu a reușit: ' + String(error) + '. Poți salva o copie PDF.', 'error')
    }).finally(() => {
      if (printAbortRef.current === controller) printAbortRef.current = null
      printInProgress.current = false
      dispatch({ type: 'printing/set', printing: false })
    })
  }, [state.file, collectFormValues, toast])

  // Persist the reading session (page + zoom) for the next launch.
  useEffect(() => {
    const file = state.file
    if (!file) return
    const timer = window.setTimeout(() => {
      void db.saveSession({
        path: file.path,
        page: state.page,
        zoom: state.zoom,
        zoomMode: state.zoomMode,
        scrollTop: 0,
        updatedAt: Date.now()
      })
    }, 800)
    return () => window.clearTimeout(timer)
  }, [state.file, state.page, state.zoom, state.zoomMode])

  const value = useMemo<AppContextValue>(
    () => ({
      state,
      dispatch,
      docRef,
      dataRef,
      toast,
      openDialog,
      openPath,
      openFile,
      closeDocument,
      setPage,
      setZoom,
      zoomBy,
      fitWidth: () => setZoom(state.zoom, 'fit-width'),
      fitPage: () => setZoom(state.zoom, 'fit-page'),
      toggleSidebar,
      setTool,
      setColor,
      addAnnotation,
      removeAnnotation,
      updateAnnotation,
      undoAnnotation,
      redoAnnotation,
      clearAnnotations,
      runSearch,
      goToHit,
      jumpToHit,
      saveCopy,
      pageOperation,
      print
    }),
    [
      state,
      toast,
      openDialog,
      openPath,
      openFile,
      closeDocument,
      setPage,
      setZoom,
      zoomBy,
      toggleSidebar,
      setTool,
      setColor,
      addAnnotation,
      removeAnnotation,
      updateAnnotation,
      undoAnnotation,
      redoAnnotation,
      clearAnnotations,
      runSearch,
      goToHit,
      jumpToHit,
      saveCopy,
      pageOperation,
      print
    ]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp must be used inside AppProvider')
  return context
}

async function resolveOutlinePage(
  doc: PDFDocumentProxy,
  dest: unknown
): Promise<number> {
  try {
    if (Array.isArray(dest)) {
      const index = await doc.getPageIndex(dest[0] as never)
      return typeof index === 'number' ? index + 1 : 1
    }
    if (dest && typeof dest === 'object' && 'url' in dest) {
      const index = await doc.getPageIndex(dest as never)
      return typeof index === 'number' ? index + 1 : 1
    }
  } catch {
    /* ignore */
  }
  return 1
}
