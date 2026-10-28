import type { JSX } from 'react'
import { useApp } from '../state/store'
import { Icon } from './Icon'

export function Toasts(): JSX.Element {
  const { state, dispatch } = useApp()

  if (state.toasts.length === 0) return <></>

  return (
    <div className="toasts" role="status" aria-live="polite">
      {state.toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.tone}`}>
          <Icon name={toast.tone === 'error' ? 'shield' : 'check'} size={16} />
          <span>{toast.message}</span>
          <button
            type="button"
            className="toast__close"
            aria-label="Închide notificarea"
            onClick={() => dispatch({ type: 'toast/remove', id: toast.id })}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
