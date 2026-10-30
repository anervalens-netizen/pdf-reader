import { useEffect, useState, type JSX } from 'react'
import { useApp } from '../state/store'
import { api, isDesktop } from '../lib/api'
import { Icon } from './Icon'
import { UpdateDialog } from './UpdateDialog'

export function TitleBar(): JSX.Element {
  const { state } = useApp()
  const [updatesOpen, setUpdatesOpen] = useState(false)
  const [updatesAvailable, setUpdatesAvailable] = useState(false)
  useEffect(() => {
    if (!isDesktop || localStorage.getItem('pdf.autoUpdateCheck') !== 'true') return
    let alive = true
    void api.checkForUpdates().then((result) => {
      if (alive) setUpdatesAvailable(result.status === 'available')
    }).catch(() => {})
    return () => { alive = false }
  }, [] )

  return (
    <header className="titlebar" data-ta-drag-region>
      <div className="titlebar__left" data-ta-drag-region>
        <span className="titlebar__mark" aria-hidden="true">
          <Icon name="file" size={16} />
        </span>
        <span className="titlebar__titles" data-ta-drag-region>
          <span className="titlebar__title">{state.file?.name ?? 'PDF'}</span>
          {state.file && <span className="titlebar__subtitle">{state.file.path}</span>}
        </span>
      </div>

      <div className="titlebar__right">
        {isDesktop &&
          <button type="button" className={'icon-btn' + (updatesAvailable ? ' is-active' : '')}
            title={updatesAvailable ? 'Actualizare disponibilă' : 'Actualizări'}
            aria-label="Actualizări" onClick={() => setUpdatesOpen(true)}>
            <Icon name="refresh" size={16} />
          </button>}
        {isDesktop && api.platform() !== 'win32' && (
          <div className="window-controls" role="group" aria-label="Controale fereastră">
            <button
              type="button"
              className="window-controls__btn"
              title="Minimizează"
              aria-label="Minimizează"
              onClick={() => void api.windowControl('minimize')}
            >
              <Icon name="chevronDown" size={16} style={{ transform: 'rotate(180deg)' }} />
            </button>
            <button
              type="button"
              className="window-controls__btn"
              title="Maximizează"
              aria-label="Maximizează"
              onClick={() => void api.windowControl('maximize')}
            >
              <Icon name="fitPage" size={15} />
            </button>
            <button
              type="button"
              className="window-controls__btn window-controls__btn--close"
              title="Închide"
              aria-label="Închide"
              onClick={() => void api.windowControl('close')}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        )}
      </div>
      {updatesOpen && <UpdateDialog onClose={() => setUpdatesOpen(false)} />}
    </header>
  )
}
