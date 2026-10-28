import { useEffect, useRef, useState, type JSX } from 'react'
import { useApp, type Tool } from '../state/store'
import { HIGHLIGHT_COLORS, INK_COLORS } from '../lib/annotations'
import { Icon, type IconName } from './Icon'

const TOOLS: { id: Tool; icon: IconName; label: string; shortcut: string }[] = [
  { id: 'select', icon: 'select', label: 'Selectare', shortcut: 'Esc' },
  { id: 'highlight', icon: 'highlight', label: 'Evidențiere', shortcut: 'H' },
  { id: 'underline', icon: 'underline', label: 'Subliniere', shortcut: 'U' },
  { id: 'note', icon: 'note', label: 'Notiță', shortcut: 'N' },
  { id: 'draw', icon: 'pen', label: 'Desen', shortcut: 'D' },
  { id: 'signature', icon: 'signature', label: 'Semnătură', shortcut: 'S' }
]

export function Toolbar({
  onSignatureRequest
}: {
  onSignatureRequest: () => void
}): JSX.Element {
  const {
    state,
    dispatch,
    setPage,
    zoomBy,
    setZoom,
    toggleSidebar,
    setTool,
    setColor,
    saveCopy,
    print
  } = useApp()
  const [pageInput, setPageInput] = useState(String(state.page))
  const [colorsOpen, setColorsOpen] = useState(false)
  const colorsRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => setPageInput(String(state.page)), [state.page])

  useEffect(() => {
    if (!colorsOpen) return
    const onPointerDown = (event: MouseEvent): void => {
      if (!colorsRef.current?.contains(event.target as Node)) setColorsOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [colorsOpen])

  const palette = state.tool === 'draw' ? INK_COLORS : HIGHLIGHT_COLORS
  const showPalette = state.tool === 'highlight' || state.tool === 'underline' || state.tool === 'draw'

  const commitPage = (): void => {
    const value = Number.parseInt(pageInput, 10)
    if (Number.isFinite(value)) setPage(value)
    else setPageInput(String(state.page))
  }

  const themeIcon: IconName =
    state.theme === 'light' ? 'sun' : state.theme === 'dark' ? 'moon' : 'monitor'

  return (
    <div className="toolbar" role="toolbar" aria-label="Bară de instrumente">
      <div className="toolbar__group">
        <button
          type="button"
          className={`icon-btn${state.sidebarOpen ? ' is-active' : ''}`}
          title="Panou lateral (Ctrl+B)"
          aria-label="Comută panoul lateral"
          aria-pressed={state.sidebarOpen}
          onClick={toggleSidebar}
        >
          <Icon name="panel" />
        </button>
      </div>

      <div className="toolbar__divider" />

      <div className="toolbar__group">
        <button
          type="button"
          className="icon-btn"
          title="Pagina anterioară"
          aria-label="Pagina anterioară"
          disabled={!state.file || state.page <= 1}
          onClick={() => setPage(state.page - 1)}
        >
          <Icon name="chevronLeft" />
        </button>
        <div className="page-indicator">
          {state.file ? (
            <>
              <input
                className="page-indicator__input"
                value={pageInput}
                inputMode="numeric"
                aria-label="Numărul paginii"
                onChange={(event) => setPageInput(event.target.value)}
                onBlur={commitPage}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.currentTarget.blur()
                  }
                }}
              />
              <span className="page-indicator__total">/ {state.numPages}</span>
            </>
          ) : (
            <span className="page-indicator__total">—</span>
          )}
        </div>
        <button
          type="button"
          className="icon-btn"
          title="Pagina următoare"
          aria-label="Pagina următoare"
          disabled={!state.file || state.page >= state.numPages}
          onClick={() => setPage(state.page + 1)}
        >
          <Icon name="chevronRight" />
        </button>
      </div>

      <div className="toolbar__divider" />

      <div className="toolbar__group">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            type="button"
            className={`icon-btn${state.tool === tool.id ? ' is-active' : ''}`}
            title={`${tool.label} (${tool.shortcut})`}
            aria-label={tool.label}
            aria-pressed={state.tool === tool.id}
            disabled={!state.file}
            onClick={() => {
              if (tool.id === 'signature') {
                onSignatureRequest()
                return
              }
              setTool(tool.id)
            }}
          >
            <Icon name={tool.icon} />
          </button>
        ))}

        <div className="color-picker" ref={colorsRef}>
          <button
            type="button"
            className={`color-picker__swatch${showPalette ? ' is-open' : ''}`}
            style={{ background: state.color }}
            title="Culoare"
            aria-label="Alege culoarea"
            aria-expanded={colorsOpen}
            disabled={!state.file || !showPalette}
            onClick={() => setColorsOpen((open) => !open)}
          />
          {colorsOpen && showPalette && (
            <div className="color-picker__menu" role="menu">
              {palette.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`color-picker__option${state.color === color ? ' is-active' : ''}`}
                  style={{ background: color }}
                  title={color}
                  aria-label={`Culoare ${color}`}
                  onClick={() => {
                    setColor(color)
                    setColorsOpen(false)
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="toolbar__spacer" />

      <div className="toolbar__group">
        <button
          type="button"
          className={`icon-btn${state.searchOpen ? ' is-active' : ''}`}
          title="Caută (Ctrl+F)"
          aria-label="Caută"
          aria-pressed={state.searchOpen}
          disabled={!state.file}
          onClick={() => dispatch({ type: 'search/toggle', open: !state.searchOpen })}
        >
          <Icon name="search" />
        </button>
      </div>

      <div className="toolbar__divider" />

      <div className="toolbar__group">
        <button
          type="button"
          className="icon-btn"
          title="Micșorează (Ctrl+−)"
          aria-label="Micșorează"
          disabled={!state.file}
          onClick={() => zoomBy(1 / 1.15)}
        >
          <Icon name="zoomOut" />
        </button>
        <button
          type="button"
          className="zoom-readout"
          title="Resetare zoom (Ctrl+0)"
          disabled={!state.file}
          onClick={() => setZoom(1)}
        >
          {Math.round(state.zoom * 100)}%
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Mărește (Ctrl++)"
          aria-label="Mărește"
          disabled={!state.file}
          onClick={() => zoomBy(1.15)}
        >
          <Icon name="zoomIn" />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Potrivește lățimea (Ctrl+1)"
          aria-label="Potrivește lățimea"
          disabled={!state.file}
          onClick={() => setZoom(state.zoom, 'fit-width')}
        >
          <Icon name="fitWidth" />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Potrivește pagina (Ctrl+2)"
          aria-label="Potrivește pagina"
          disabled={!state.file}
          onClick={() => setZoom(state.zoom, 'fit-page')}
        >
          <Icon name="fitPage" />
        </button>
      </div>

      <div className="toolbar__divider" />

      <div className="toolbar__group">
        <button
          type="button"
          className="icon-btn"
          title="Tipărește (Ctrl+P)"
          aria-label="Tipărește"
          disabled={!state.file}
          onClick={print}
        >
          <Icon name="printer" />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Salvează o copie (Ctrl+Shift+S)"
          aria-label="Salvează o copie"
          disabled={!state.file || state.saving}
          onClick={() => void saveCopy()}
        >
          <Icon name="save" />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Comută tema (Ctrl+Shift+D)"
          aria-label="Comută tema"
          onClick={() => {
            const order = ['light', 'dark', 'system'] as const
            const next = order[(order.indexOf(state.theme) + 1) % order.length]
            dispatch({ type: 'theme/set', theme: next })
          }}
        >
          <Icon name={themeIcon} />
        </button>
      </div>
    </div>
  )
}
