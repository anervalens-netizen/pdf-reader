import { useEffect, useRef, useState, type JSX } from 'react'
import { useApp, type SidebarTab } from '../state/store'
import { Icon } from './Icon'

const TABS: { id: SidebarTab; icon: 'list' | 'file' | 'note'; label: string }[] = [
  { id: 'thumbnails', icon: 'file', label: 'Miniaturi' },
  { id: 'outline', icon: 'list', label: 'Cuprins' }
]

function Thumbnail({
  pageNumber,
  width,
  active,
  onSelect
}: {
  pageNumber: number
  width: number
  active: boolean
  onSelect: () => void
}): JSX.Element {
  const { docRef } = useApp()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const holderRef = useRef<HTMLButtonElement | null>(null)
  const [visible, setVisible] = useState(false)
  const [ratio, setRatio] = useState(1.414)

  useEffect(() => {
    const element = holderRef.current
    if (!element) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '200px' }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    const doc = docRef.current
    if (!doc) return
    let cancelled = false

    const render = async (): Promise<void> => {
      const canvas = canvasRef.current
      if (!canvas) return
      try {
        const page = await doc.getPage(pageNumber)
        if (cancelled) return
        const base = page.getViewport({ scale: 1 })
        const scale = width / base.width
        const viewport = page.getViewport({ scale })
        const dpr = window.devicePixelRatio || 1
        canvas.width = Math.max(1, Math.floor(viewport.width * dpr))
        canvas.height = Math.max(1, Math.floor(viewport.height * dpr))
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`
        const context = canvas.getContext('2d')
        if (!context) return
        setRatio(viewport.height / viewport.width)
        await page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined
        }).promise
      } catch (error) {
        console.warn('[thumbnail] render failed', pageNumber, error)
      }
    }

    void render()
    return () => {
      cancelled = true
    }
  }, [visible, pageNumber, width, docRef])

  return (
    <button
      type="button"
      ref={holderRef}
      className={`thumb${active ? ' is-active' : ''}`}
      onClick={onSelect}
      aria-label={`Pagina ${pageNumber}`}
      aria-current={active ? 'true' : undefined}
    >
      <span className="thumb__frame" style={{ width, height: width * ratio }}>
        <canvas ref={canvasRef} className="thumb__canvas" />
      </span>
      <span className="thumb__label">{pageNumber}</span>
    </button>
  )
}

export function Sidebar(): JSX.Element {
  const { state, dispatch, setPage, removeAnnotation, clearAnnotations } = useApp()
  const [tab, setTab] = useState<SidebarTab>(state.sidebarTab)
  const selectPage = (page: number): void => {
    setPage(page)
    if (window.matchMedia('(max-width: 900px)').matches) dispatch({ type: 'sidebar/set', open: false })
  }

  return (
    <aside className="sidebar" aria-label="Panou lateral">
      <div className="sidebar__tabs" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`sidebar__tab${tab === item.id ? ' is-active' : ''}`}
            title={item.label}
            onClick={() => setTab(item.id)}
          >
            <Icon name={item.icon} size={16} />
            <span>{item.label}</span>
          </button>
        ))}
        <button type="button" className="sidebar__close" aria-label="Închide panoul" onClick={() => dispatch({ type: 'sidebar/set', open: false })}>×</button>
      </div>

      {tab === 'thumbnails' && (
        <div className="sidebar__body" role="tabpanel">
          {Array.from({ length: state.numPages }, (_, index) => index + 1).map((pageNumber) => (
            <Thumbnail
              key={pageNumber}
              pageNumber={pageNumber}
              width={148}
              active={pageNumber === state.page}
              onSelect={() => selectPage(pageNumber)}
            />
          ))}
        </div>
      )}

      {tab === 'outline' && (
        <div className="sidebar__body" role="tabpanel">
          {!state.outline || state.outline.length === 0 ? (
            <p className="sidebar__empty">Acest document nu are cuprins.</p>
          ) : (
            <ul className="outline">
              {state.outline.map((item, index) => (
                <li key={`${item.title}-${index}`}>
                  <button
                    type="button"
                    className="outline__item"
                    onClick={() => selectPage(item.page)}
                    title={item.title}
                  >
                    <Icon name="chevronRight" size={13} />
                    <span>{item.title}</span>
                    <span className="outline__page">{item.page}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {state.annotations.length > 0 && (
        <div className="sidebar__footer">
          <span>
            {state.annotations.length}{' '}
            {state.annotations.length === 1 ? 'adnotare' : 'adnotări'}
          </span>
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              if (window.confirm('Elimini toate adnotările din acest document?')) clearAnnotations()
            }}
          >
            Elimină tot
          </button>
        </div>
      )}

      {state.annotations.length > 0 && tab === 'thumbnails' && (
        <div className="sidebar__annotations">
          {state.annotations.map((annotation) => (
            <div key={annotation.id} className="sidebar__annotation">
              <span
                className="sidebar__annotation-color"
                style={{ background: annotation.color }}
                aria-hidden="true"
              />
              <span className="sidebar__annotation-label">
                {annotation.type === 'highlight'
                  ? 'Evidențiere'
                  : annotation.type === 'underline'
                    ? 'Subliniere'
                    : annotation.type === 'note'
                      ? 'Notiță'
                      : annotation.type === 'ink'
                        ? 'Desen'
                        : 'Semnătură'}{' '}
                · p. {annotation.page + 1}
              </span>
              <button
                type="button"
                className="icon-btn icon-btn--sm"
                title="Șterge adnotarea"
                aria-label="Șterge adnotarea"
                onClick={() => removeAnnotation(annotation.id)}
              >
                <Icon name="trash" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        className="sidebar__collapse"
        title="Restrânge panoul (Ctrl+B)"
        aria-label="Restrânge panoul"
        onClick={() => dispatch({ type: 'sidebar/set', open: false })}
      >
        <Icon name="chevronLeft" size={15} />
      </button>
    </aside>
  )
}
