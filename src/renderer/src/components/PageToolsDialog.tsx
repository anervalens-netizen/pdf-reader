import { useEffect, useState, type JSX } from 'react'
import { useApp, type PageOperation } from '../state/store'

const choices: { value: PageOperation; label: string }[] = [
  { value: 'rotate', label: 'Rotește pagina curentă 90°' },
  { value: 'extract', label: 'Extrage paginile selectate' },
  { value: 'merge', label: 'Combină cu alt document PDF' },
  { value: 'split', label: 'Separă PDF-ul în două părți' }
]

export function PageToolsDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const { state, pageOperation } = useApp()
  const [action, setAction] = useState<PageOperation>('rotate')
  const [selection, setSelection] = useState(String(state.page))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || busy) return
      event.preventDefault()
      event.stopImmediatePropagation()
      onClose()
    }
    document.addEventListener('keydown', onEscape, true)
    return () => document.removeEventListener('keydown', onEscape, true)
  }, [busy, onClose])

  const selectOperation = (next: PageOperation): void => {
    setAction(next)
    setSelection(next === 'split' ? String(Math.max(1, Math.floor(state.numPages / 2))) : String(state.page))
  }

  const apply = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      if (await pageOperation(action, selection)) onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Operații pe pagini">
        <header className="modal__header">
          <h2 className="modal__title">Operații pe pagini</h2>
        </header>
        <div className="modal__body">
          <p className="modal__hint">
            Creează întotdeauna un PDF nou. Originalul nu se modifică.
          </p>
          <label className="page-tools__label" htmlFor="pdf-page-operation">Operație</label>
          <select
            id="pdf-page-operation"
            className="text-input page-tools__input"
            value={action}
            disabled={busy}
            onChange={(event) => selectOperation(event.target.value as PageOperation)}
          >
            {choices.map((choice) => (
              <option key={choice.value} value={choice.value} disabled={choice.value === 'split' && state.numPages < 2}>
                {choice.label}
              </option>
            ))}
          </select>

          {(action === 'extract' || action === 'split') && (
            <>
              <label className="page-tools__label" htmlFor="pdf-page-selection">
                {action === 'extract' ? 'Pagini de extras (exemplu: 1-3,5)' : 'Separă după pagina'}
              </label>
              <input
                id="pdf-page-selection"
                className="text-input page-tools__input"
                value={selection}
                disabled={busy}
                inputMode={action === 'split' ? 'numeric' : 'text'}
                onChange={(event) => setSelection(event.target.value)}
              />
              <p className="modal__hint">Documentul are {state.numPages} pagini.</p>
            </>
          )}
          {action === 'merge' && (
            <p className="modal__hint">După confirmare, alege al doilea PDF din sistemul de fișiere.</p>
          )}
          <p className="modal__hint">
            Atenție: modificarea paginilor poate invalida semnăturile digitale existente și poate afecta formularele interactive.
          </p>
        </div>
        <footer className="modal__footer">
          <div className="modal__footer-spacer" />
          <button className="btn" type="button" disabled={busy} onClick={onClose}>Renunță</button>
          <button className="btn btn--primary" type="button" disabled={busy} onClick={() => void apply()}>
            {busy ? 'Se procesează…' : 'Continuă și salvează'}
          </button>
        </footer>
      </div>
    </div>
  )
}
