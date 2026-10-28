import type { JSX } from 'react'
import { useApp } from '../state/store'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function StatusBar(): JSX.Element {
  const { state } = useApp()

  return (
    <footer className="statusbar">
      <div className="statusbar__group">
        {state.file ? (
          <>
            <span>
              Pagina <strong>{state.page}</strong> din {state.numPages}
            </span>
            <span className="statusbar__sep" />
            <span>{formatBytes(state.file.size)}</span>
            {state.annotations.length > 0 && (
              <>
                <span className="statusbar__sep" />
                <span>
                  {state.annotations.length}{' '}
                  {state.annotations.length === 1 ? 'adnotare' : 'adnotări'}
                </span>
              </>
            )}
          </>
        ) : (
          <span>Niciun document deschis</span>
        )}
      </div>
      <div className="statusbar__group">
        <span>{Math.round(state.zoom * 100)}%</span>
      </div>
    </footer>
  )
}
