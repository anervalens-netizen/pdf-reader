import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { useApp, type Tool } from './state/store'
import { api, isDesktop } from './lib/api'
import { registerBackHandler, registerPdfIntentHandler } from './lib/native'
import { TitleBar } from './components/TitleBar'
import { Toolbar } from './components/Toolbar'
import { Sidebar } from './components/Sidebar'
import { PageArea } from './components/PageArea'
import { StatusBar } from './components/StatusBar'
import { Toasts } from './components/Toasts'
import { ErrorPanel, Welcome } from './components/Welcome'
import { SignatureDialog } from './components/SignatureDialog'
import { PageToolsDialog } from './components/PageToolsDialog'
import { createId, NOTE_COLOR, type Annotation } from './lib/annotations'

interface PendingNote {
  page: number
  x: number
  y: number
}

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element) return false
  const tag = element.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || element.isContentEditable
}

export default function App(): JSX.Element {
  const {
    state,
    dispatch,
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
    addAnnotation,
    runSearch,
    goToHit,
    saveCopy,
    print
  } = useApp()

  const [signatureOpen, setSignatureOpen] = useState(false)
  const [pagesOpen, setPagesOpen] = useState(false)
  const [signatureImage, setSignatureImage] = useState<string | null>(null)
  const [pendingNote, setPendingNote] = useState<PendingNote | null>(null)
  const [noteText, setNoteText] = useState('')
  const noteInputRef = useRef<HTMLTextAreaElement | null>(null)

  // Android ACTION_VIEW: receive PDFs sent via "Open with" by file managers.
  useEffect(() => {
    let disposed = false
    let unsubscribe: (() => void) | undefined
    void registerPdfIntentHandler(
      (file) => { if (!disposed) void openFile(file) },
      (message) => { if (!disposed) toast(message, 'error') }
    ).then((remove) => {
      if (disposed) remove()
      else unsubscribe = remove
    }).catch((error) => {
      if (!disposed) toast('Deschiderea PDF din Android nu este disponibilă: ' + String(error), 'error')
    })
    return () => { disposed = true; unsubscribe?.() }
  }, [openFile, toast])

  // --- Native menu actions --------------------------------------------------
  useEffect(() => {
    return api.onMenuAction((action) => {
      switch (action) {
        case 'open':
          void openDialog()
          break
        case 'save-as':
          void saveCopy()
          break
        case 'print':
          print()
          break
        case 'close-document':
          closeDocument()
          break
        case 'find':
          dispatch({ type: 'search/toggle', open: true })
          break
        case 'find-next':
          goToHit(1)
          break
        case 'find-prev':
          goToHit(-1)
          break
        case 'toggle-sidebar':
          toggleSidebar()
          break
        case 'zoom-in':
          zoomBy(1.15)
          break
        case 'zoom-out':
          zoomBy(1 / 1.15)
          break
        case 'zoom-reset':
          setZoom(1)
          break
        case 'fit-width':
          setZoom(state.zoom, 'fit-width')
          break
        case 'fit-page':
          setZoom(state.zoom, 'fit-page')
          break
        case 'toggle-theme': {
          const order = ['light', 'dark', 'system'] as const
          dispatch({
            type: 'theme/set',
            theme: order[(order.indexOf(state.theme) + 1) % order.length]
          })
          break
        }
        case 'toggle-fullscreen':
          void api.windowControl('maximize')
          break
        default:
          break
      }
    })
  }, [dispatch, openDialog, saveCopy, print, closeDocument, goToHit, toggleSidebar, zoomBy, setZoom, state.zoom, state.theme])

  // --- Files opened from the OS --------------------------------------------
  useEffect(() => {
    const unsubscribe = api.onFileOpened(({ path }) => {
      void openPath(path)
    })
    // The main process must not send launch-argument files until this handler
    // exists; did-finish-load occurs before React useEffect registration.
    api.rendererReady()
    return unsubscribe
  }, [openPath])

  // --- Drag & drop ----------------------------------------------------------
  useEffect(() => {
    const onDragOver = (event: DragEvent): void => {
      event.preventDefault()
      document.body.classList.add('is-dragging')
    }
    const onDragLeave = (event: DragEvent): void => {
      if (event.relatedTarget === null) document.body.classList.remove('is-dragging')
    }
    const onDrop = (event: DragEvent): void => {
      // On the desktop the preload resolves the real file path and asks the
      // main process to open it; the renderer only reacts to the visual state.
      // In the browser there is no preload, so the file is opened here.
      event.preventDefault()
      document.body.classList.remove('is-dragging')
      const file = event.dataTransfer?.files?.[0]
      if (!file) return
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        toast('PDF poate deschide doar fișiere PDF.', 'error')
        return
      }
      if (!isDesktop) void openFile(file)
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [toast, openFile])

  // --- Keyboard shortcuts ---------------------------------------------------
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const typing = isTypingTarget(event.target)
      const mod = event.ctrlKey || event.metaKey

      if (mod && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        dispatch({ type: 'search/toggle', open: true })
        return
      }
      if (mod && event.key.toLowerCase() === 'o') {
        event.preventDefault()
        void openDialog()
        return
      }
      if (mod && event.shiftKey && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void saveCopy()
        return
      }
      if (mod && event.key.toLowerCase() === 'p') {
        event.preventDefault()
        print()
        return
      }
      if (mod && event.key.toLowerCase() === 'b') {
        event.preventDefault()
        toggleSidebar()
        return
      }
      if (mod && event.key.toLowerCase() === 'd' && event.shiftKey) {
        event.preventDefault()
        const order = ['light', 'dark', 'system'] as const
        dispatch({
          type: 'theme/set',
          theme: order[(order.indexOf(state.theme) + 1) % order.length]
        })
        return
      }
      if (mod && (event.key === '=' || event.key === '+')) {
        event.preventDefault()
        zoomBy(1.15)
        return
      }
      if (mod && event.key === '-') {
        event.preventDefault()
        zoomBy(1 / 1.15)
        return
      }
      if (mod && event.key === '0') {
        event.preventDefault()
        setZoom(1)
        return
      }
      if (mod && event.key === '1') {
        event.preventDefault()
        setZoom(state.zoom, 'fit-width')
        return
      }
      if (mod && event.key === '2') {
        event.preventDefault()
        setZoom(state.zoom, 'fit-page')
        return
      }
      if (event.key === 'Escape') {
        if (state.searchOpen) dispatch({ type: 'search/close' })
        else if (state.tool !== 'select') setTool('select')
        return
      }
      if (typing) return

      if (event.key === 'PageDown') {
        event.preventDefault()
        setPage(state.page + 1)
        return
      }
      if (event.key === 'PageUp') {
        event.preventDefault()
        setPage(state.page - 1)
        return
      }
      if (event.key === 'F3') {
        event.preventDefault()
        goToHit(event.shiftKey ? -1 : 1)
        return
      }
      if (!mod && state.file) {
        const tools: Record<string, Tool> = {
          h: 'highlight',
          u: 'underline',
          n: 'note',
          d: 'draw',
          v: 'select'
        }
        const tool = tools[event.key.toLowerCase()]
        if (tool) {
          event.preventDefault()
          setTool(tool)
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    dispatch,
    openDialog,
    saveCopy,
    print,
    toggleSidebar,
    zoomBy,
    setZoom,
    setPage,
    setTool,
    goToHit,
    state.theme,
    state.tool,
    state.page,
    state.searchOpen,
    state.zoom,
    state.file
  ])

  // --- Printing -------------------------------------------------------------
  useEffect(() => {
    const handler = (): void => {
      print()
    }
    window.addEventListener('pdf:print', handler)
    return () => window.removeEventListener('pdf:print', handler)
  }, [print])

  // --- Note dialog ----------------------------------------------------------
  useEffect(() => {
    if (pendingNote) window.setTimeout(() => noteInputRef.current?.focus(), 30)
  }, [pendingNote])

  // --- Android back button --------------------------------------------------
  // The handler is registered once and always reads the current state through
  // a ref, so the native listener never closes over a stale render.
  const backHandlerRef = useRef<() => boolean>(() => false)
  backHandlerRef.current = (): boolean => {
    if (pagesOpen) {
      setPagesOpen(false)
      return true
    }
    if (pendingNote) {
      setPendingNote(null)
      setNoteText('')
      return true
    }
    if (signatureOpen) {
      setSignatureOpen(false)
      return true
    }
    if (state.sidebarOpen && window.matchMedia('(max-width: 900px)').matches) {
      dispatch({ type: 'sidebar/set', open: false })
      return true
    }
    if (state.file) {
      closeDocument()
      return true
    }
    return false
  }

  useEffect(() => {
    void registerBackHandler(() => backHandlerRef.current())
  }, [])

  const commitNote = useCallback(() => {
    if (!pendingNote) return
    const size = 22
    const annotation: Annotation = {
      id: createId(),
      type: 'note',
      page: pendingNote.page,
      color: NOTE_COLOR,
      opacity: 0.92,
      createdAt: Date.now(),
      rect: [pendingNote.x, pendingNote.y, pendingNote.x + size, pendingNote.y + size],
      comment: noteText.trim()
    }
    addAnnotation(annotation)
    setPendingNote(null)
    setNoteText('')
    setTool('select')
  }, [pendingNote, noteText, addAnnotation, setTool])

  const placeSignature = useCallback(
    (page: number, x: number, y: number) => {
      if (!signatureImage) return
      const width = 150
      const height = 52
      const annotation: Annotation = {
        id: createId(),
        type: 'signature',
        page: page - 1,
        color: '#23221f',
        opacity: 1,
        createdAt: Date.now(),
        rect: [x, y, x + width, y + height],
        image: signatureImage
      }
      addAnnotation(annotation)
      setSignatureImage(null)
      setTool('select')
      toast('Semnătura a fost plasată pe pagină.', 'success')
    },
    [signatureImage, addAnnotation, setTool, toast]
  )

  const searchTerm = state.query

  useEffect(() => {
    if (searchTerm && state.searchOpen) void runSearch(searchTerm)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="app" data-platform={api.platform()}>
      <TitleBar />
      <Toolbar onSignatureRequest={() => setSignatureOpen(true)} onPagesRequest={() => setPagesOpen(true)} />

      <div className="app__body">
        {state.sidebarOpen && state.file && (
          <>
            <button type="button" className="sidebar-backdrop" aria-label="Închide panoul" onClick={() => dispatch({ type: 'sidebar/set', open: false })} />
            <Sidebar />
          </>
        )}

        <main className="app__main">
          {state.status === 'loading' && (
            <div className="loader" role="status">
              <span className="loader__spinner" aria-hidden="true" />
              <span>Se deschide documentul…</span>
            </div>
          )}

          {state.status === 'error' && !state.needsPassword && <ErrorPanel />}

          {state.needsPassword && (
            <div className="welcome">
              <div className="welcome__card">
                <h1 className="welcome__title">Document protejat</h1>
                <p className="welcome__subtitle">Introdu parola pentru a deschide acest PDF.</p>
                <PasswordPrompt
                  onSubmit={async (password) => {
                    if (state.file) await openPath(state.file.path, password)
                  }}
                />
              </div>
            </div>
          )}

          {state.status === 'idle' && !state.file && <Welcome />}
          {state.status === 'ready' && state.file && (
            <PageArea
              signatureImage={signatureImage}
              onPlaceSignature={placeSignature}
              onRequestNote={(page, x, y) => {
                setPendingNote({ page: page - 1, x, y })
                setNoteText('')
              }}
            />
          )}
        </main>
      </div>

      <StatusBar />
      <Toasts />

      {pagesOpen && <PageToolsDialog onClose={() => setPagesOpen(false)} />}

      <SignatureDialog
        open={signatureOpen}
        onCancel={() => setSignatureOpen(false)}
        onConfirm={(dataUrl) => {
          setSignatureImage(dataUrl)
          setSignatureOpen(false)
          setTool('signature')
          toast('Semnătura e gata — click pe pagină pentru a o plasa.', 'info')
        }}
      />

      {pendingNote && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Adaugă notiță">
          <div className="modal modal--sm">
            <header className="modal__header">
              <h2 className="modal__title">Notiță</h2>
            </header>
            <div className="modal__body">
              <textarea
                ref={noteInputRef}
                className="note-input"
                placeholder="Scrie o notiță…"
                aria-label="Textul notiței"
                value={noteText}
                onChange={(event) => setNoteText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) commitNote()
                }}
              />
            </div>
            <footer className="modal__footer">
              <div className="modal__footer-spacer" />
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setPendingNote(null)
                  setNoteText('')
                }}
              >
                Renunță
              </button>
              <button type="button" className="btn btn--primary" onClick={commitNote}>
                Adaugă
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  )
}

function PasswordPrompt({ onSubmit }: { onSubmit: (password: string) => Promise<void> }): JSX.Element {
  const [password, setPassword] = useState('')
  return (
    <div className="password-prompt">
      <input
        className="text-input"
        type="password"
        value={password}
        placeholder="Parolă"
        aria-label="Parola documentului"
        onChange={(event) => setPassword(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && password) void onSubmit(password)
        }}
      />
      <button type="button" className="btn btn--primary" onClick={() => void onSubmit(password)}>
        Deblochează
      </button>
    </div>
  )
}
