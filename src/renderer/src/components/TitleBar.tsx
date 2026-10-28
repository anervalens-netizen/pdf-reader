import type { JSX } from 'react'
import { useApp } from '../state/store'
import { api } from '../lib/api'
import { Icon } from './Icon'

export function TitleBar(): JSX.Element {
  const { state } = useApp()

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
        {api.platform() !== 'win32' && (
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
    </header>
  )
}
