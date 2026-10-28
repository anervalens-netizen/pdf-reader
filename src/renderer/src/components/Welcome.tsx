import { useEffect, useRef, useState, type JSX } from 'react'
import { useApp } from '../state/store'
import { clearRecents } from '../lib/db'
import { Icon } from './Icon'

export function Welcome(): JSX.Element {
  const { state, openDialog, openPath, dispatch } = useApp()

  return (
    <div className="welcome">
      <div className="welcome__card">
        <div className="welcome__mark" aria-hidden="true">
          <Icon name="file" size={26} />
        </div>
        <h1 className="welcome__title">PDF</h1>
        <p className="welcome__subtitle">
          Un cititor PDF rapid și calm. Deschide un document pentru a citi, căuta și adnota.
        </p>

        <div className="welcome__actions">
          <button type="button" className="btn btn--primary" onClick={() => void openDialog()}>
            <Icon name="folder" size={16} />
            Deschide document
          </button>
        </div>

        <p className="welcome__hint">
          Poți trage un fișier PDF în fereastră sau să-l deschizi cu dublu clic din Explorator.
        </p>

        {state.recents.length > 0 && (
          <div className="welcome__recents">
            <div className="welcome__recents-header">
              <span>Deschise recent</span>
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  void clearRecents()
                  dispatch({ type: 'recents/set', recents: [] })
                }}
              >
                Șterge lista
              </button>
            </div>
            <ul className="recent-list">
              {state.recents.map((recent) => (
                <li key={recent.path}>
                  <button
                    type="button"
                    className="recent-list__item"
                    onClick={() => void openPath(recent.path)}
                    title={recent.path}
                  >
                    <Icon name="file" size={15} />
                    <span className="recent-list__name">{recent.name}</span>
                    <span className="recent-list__time">
                      {new Date(recent.lastOpened).toLocaleDateString('ro-RO', {
                        day: '2-digit',
                        month: 'short'
                      })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

export function ErrorPanel(): JSX.Element {
  const { state, openDialog } = useApp()
  const [showDetails, setShowDetails] = useState(false)
  const retryRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    retryRef.current?.focus()
  }, [])

  return (
    <div className="welcome">
      <div className="welcome__card welcome__card--error">
        <div className="welcome__mark welcome__mark--error" aria-hidden="true">
          <Icon name="shield" size={24} />
        </div>
        <h1 className="welcome__title">Documentul nu a putut fi deschis</h1>
        <p className="welcome__subtitle">{state.error}</p>
        <div className="welcome__actions">
          <button type="button" className="btn btn--primary" ref={retryRef} onClick={() => void openDialog()}>
            Deschide alt document
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setShowDetails((value) => !value)}
          >
            {showDetails ? 'Ascunde detalii' : 'Arată detalii'}
          </button>
        </div>
        {showDetails && <pre className="welcome__details">{state.error}</pre>}
      </div>
    </div>
  )
}
