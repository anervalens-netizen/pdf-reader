import { useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react'
import { useApp, type Tool } from '../state/store'
import { api, isDesktop } from '../lib/api'
import type { AppInfo } from '../../../shared/api'

type Section = 'file' | 'edit' | 'view' | 'tools' | 'settings' | 'help'
type Action = 'open' | 'save' | 'print' | 'close' | 'undo' | 'redo' | 'find' | 'sidebar' | 'zoom-in' | 'zoom-out' | 'fit-page' | 'fit-width' | 'highlight' | 'text' | 'signature' | 'pages' | 'ai' | 'preferences' | 'about'
const sections: { id: Section; label: string }[] = [
  { id: 'file', label: 'Fișier' }, { id: 'edit', label: 'Editare' },
  { id: 'view', label: 'Vizualizare' }, { id: 'tools', label: 'Instrumente' },
  { id: 'settings', label: 'Setări' }, { id: 'help', label: 'Ajutor' }
]
const entries: Record<Section, { label: string; action: Action; needsFile?: boolean; desktopOnly?: boolean }[]> = {
  file: [
    { label: 'Deschide…', action: 'open' },
    { label: 'Salvează o copie…', action: 'save', needsFile: true },
    { label: 'Tipărește…', action: 'print', needsFile: true },
    { label: 'Închide documentul', action: 'close', needsFile: true }
  ],
  edit: [
    { label: 'Anulează', action: 'undo', needsFile: true },
    { label: 'Refă', action: 'redo', needsFile: true },
    { label: 'Caută în document', action: 'find', needsFile: true }
  ],
  view: [
    { label: 'Panou lateral', action: 'sidebar', needsFile: true },
    { label: 'Mărește', action: 'zoom-in', needsFile: true },
    { label: 'Micșorează', action: 'zoom-out', needsFile: true },
    { label: 'Potrivește lățimea', action: 'fit-width', needsFile: true },
    { label: 'Potrivește pagina', action: 'fit-page', needsFile: true }
  ],
  tools: [
    { label: 'Evidențiere', action: 'highlight', needsFile: true },
    { label: 'Casetă text', action: 'text', needsFile: true },
    { label: 'Semnătură', action: 'signature', needsFile: true },
    { label: 'Organizare pagini', action: 'pages', needsFile: true },
    { label: 'Întreabă ChatGPT', action: 'ai', needsFile: true, desktopOnly: true }
  ],
  settings: [{ label: 'Preferințe…', action: 'preferences' }],
  help: [{ label: 'Despre PDF', action: 'about' }]
}

export function AppMenu({ variant, onRegisterBack, onSignature, onPages, onAi }: {
  variant: 'desktop' | 'mobile'
  onRegisterBack: (handler: (() => boolean) | null) => void
  onSignature: () => void
  onPages: () => void
  onAi: () => void
}): JSX.Element {
  const { state, dispatch, openDialog, openPath, saveCopy, print, closeDocument, undoAnnotation, redoAnnotation,
    toggleSidebar, zoomBy, setZoom, setTool } = useApp()
  const [active, setActive] = useState<Section | 'all' | null>(null)
  const [dialog, setDialog] = useState<'preferences' | 'about' | null>(null)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [autoUpdate, setAutoUpdate] = useState(() => localStorage.getItem('pdf.autoUpdateCheck') === 'true')
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!active) return
    const close = (event: MouseEvent): void => {
      if (!root.current?.contains(event.target as Node)) setActive(null)
    }
    document.addEventListener('mousedown', close)
    return () => { document.removeEventListener('mousedown', close) }
  }, [active])

  // Keep Back handling in sync with the topmost layer before the UI is painted.
  useLayoutEffect(() => {
    onRegisterBack(() => {
      if (dialog) { setDialog(null); return true }
      if (active) { setActive(null); return true }
      return false
    })
    return () => onRegisterBack(null)
  }, [active, dialog, onRegisterBack])

  const showPreferences = (): void => {
    setAutoUpdate(localStorage.getItem('pdf.autoUpdateCheck') === 'true')
    setDialog('preferences')
  }

  useEffect(() => {
    if (variant !== 'desktop') return
    return api.onMenuAction((action) => {
      if (action === 'recent') setActive('file')
      if (action === 'settings') showPreferences()
      if (action === 'about') setDialog('about')
    })
  }, [variant])

  useEffect(() => {
    if (dialog !== 'about') return
    let alive = true
    void api.appInfo().then((result) => { if (alive) setInfo(result) }).catch(() => {})
    return () => { alive = false }
  }, [dialog])

  const execute = (action: Action): void => {
    setActive(null)
    switch (action) {
      case 'open': void openDialog(); break
      case 'save': void saveCopy(); break
      case 'print': print(); break
      case 'close': closeDocument(); break
      case 'undo': undoAnnotation(); break
      case 'redo': redoAnnotation(); break
      case 'find': dispatch({ type: 'search/toggle', open: true }); break
      case 'sidebar': toggleSidebar(); break
      case 'zoom-in': zoomBy(1.15); break
      case 'zoom-out': zoomBy(1 / 1.15); break
      case 'fit-width': setZoom(state.zoom, 'fit-width'); break
      case 'fit-page': setZoom(state.zoom, 'fit-page'); break
      case 'highlight': case 'text': setTool(action as Tool); break
      case 'signature': onSignature(); break
      case 'pages': onPages(); break
      case 'ai': onAi(); break
      case 'preferences': showPreferences(); break
      case 'about': setDialog('about'); break
    }
  }
  const renderEntries = (section: Section): JSX.Element => (
    <div className="app-menu__section" key={section}>
      {variant === 'mobile' && <div className="app-menu__heading">{sections.find((item) => item.id === section)?.label}</div>}
      {section === 'file' && state.recents.length > 0 && (
        <>
          <div className="app-menu__heading">Deschise recent</div>
          {state.recents.slice(0, 8).map((recent) => (
            <button type="button" role="menuitem" className="app-menu__item" key={recent.path}
              title={recent.path} onClick={() => { setActive(null); void openPath(recent.path) }}>
              <span className="app-menu__truncate">{recent.name}</span>
            </button>
          ))}
          <div className="app-menu__separator" />
        </>
      )}
      {entries[section].filter((item) => !item.desktopOnly || isDesktop).map((item) => (
        <button type="button" role="menuitem" className="app-menu__item" key={item.action}
          disabled={(item.needsFile && state.status !== 'ready') ||
            (item.action === 'undo' && !state.history.undo) ||
            (item.action === 'redo' && !state.history.redo)}
          onClick={() => execute(item.action)}>{item.label}</button>
      ))}
    </div>
  )
  return (
    <>
      <div className={variant === 'desktop' ? 'app-menu app-menu--desktop' : 'app-menu app-menu--mobile'} ref={root}>
        {variant === 'desktop' ? sections.map((section) => (
          <div className="app-menu__anchor" key={section.id}>
            <button type="button" className={'app-menu__trigger' + (active === section.id ? ' is-active' : '')}
              aria-haspopup="menu" aria-expanded={active === section.id} onClick={() => setActive(active === section.id ? null : section.id)}>
              {section.label}
            </button>
            {active === section.id && <div className="app-menu__popup" role="menu">{renderEntries(section.id)}</div>}
          </div>
        )) : (
          <div className="app-menu__anchor">
            <button type="button" className="app-menu__trigger app-menu__trigger--mobile"
              aria-label="Meniu PDF" title="Meniu" aria-haspopup="menu" aria-expanded={active !== null}
              onClick={() => setActive(active ? null : 'all')}>⋮</button>
            {active && <div className="app-menu__popup app-menu__popup--mobile" role="menu">
              {sections.map((section) => renderEntries(section.id))}
            </div>}
          </div>
        )}
      </div>
      {dialog && <div className="modal-backdrop app-menu__modal" role="dialog" aria-modal="true"
        aria-label={dialog === 'preferences' ? 'Preferințe PDF' : 'Despre PDF'}>
        <div className="modal modal--sm">
          <header className="modal__header"><h2 className="modal__title">
            {dialog === 'preferences' ? 'Preferințe' : 'Despre PDF'}
          </h2></header>
          <div className="modal__body app-menu__body">
            {dialog === 'preferences' ? (
              <>
                <fieldset className="app-menu__fieldset"><legend>Aspect</legend>
                  {(['system', 'light', 'dark'] as const).map((theme) => (
                    <label key={theme}><input type="radio" name="pdf-theme" checked={state.theme === theme}
                      onChange={() => dispatch({ type: 'theme/set', theme })} />
                      {theme === 'system' ? 'Tema sistemului' : theme === 'light' ? 'Luminos' : 'Întunecat'}
                    </label>
                  ))}
                </fieldset>
                {isDesktop && <label className="app-menu__checkbox"><input type="checkbox" checked={autoUpdate}
                  onChange={(event) => {
                    const checked = event.target.checked
                    setAutoUpdate(checked)
                    localStorage.setItem('pdf.autoUpdateCheck', String(checked))
                  }} /> Verifică automat actualizările la pornire</label>}
                <p className="app-menu__muted">Documentele și adnotările rămân pe dispozitiv.</p>
              </>
            ) : (
              <>
                <strong>PDF Reader</strong>
                <p>Versiune {info?.version ?? '…'} · {isDesktop ? (info?.platform ?? 'Desktop') : 'Android / Web'}</p>
                <p>Cititor și editor PDF personal, fără reclame și fără telemetrie.</p>
                <p>Licență MIT. Cod sursă: anervalens-netizen/pdf-reader</p>
              </>
            )}
          </div>
          <footer className="modal__footer"><button type="button" className="btn btn--primary" onClick={() => setDialog(null)}>Închide</button></footer>
        </div>
      </div>}
    </>
  )
}
