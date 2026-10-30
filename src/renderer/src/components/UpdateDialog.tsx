import { useEffect, useState, type JSX } from 'react'
import { api } from '../lib/api'

const key = 'pdf.autoUpdateCheck'

export function UpdateDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const [autoCheck, setAutoCheck] = useState(localStorage.getItem(key) === 'true')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ status: string; version?: string; message?: string } | null>(null)
  const [supported, setSupported] = useState(false)

  useEffect(() => {
    void api.appInfo().then((info) => {
      setSupported(Boolean(info?.updatesSupported))
    }).catch(() => setSupported(false))
  }, [])

  const check = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try { setStatus(await api.checkForUpdates()) }
    catch (error) { setStatus({ status: 'error', message: String(error) }) }
    finally { setBusy(false) }
  }

  const download = async (): Promise<void> => {
    if (busy || !supported) return
    setBusy(true)
    try { setStatus(await api.downloadUpdate()) }
    catch (error) { setStatus({ status: 'error', message: String(error) }) }
    finally { setBusy(false) }
  }

  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Actualizări PDF">
    <div className="modal modal--sm">
      <header className="modal__header"><h2 className="modal__title">Actualizări PDF</h2></header>
      <div className="modal__body">
        <p className="modal__hint">Verificarea folosește numai release-urile oficiale din repository-ul aplicației.</p>
        <label className="update-check-label">
          <input type="checkbox" checked={autoCheck} onChange={(event) => {
            setAutoCheck(event.target.checked)
            localStorage.setItem(key, String(event.target.checked))
          }} />
          Verifică automat la pornire (fără instalare automată)
        </label>
        {status?.message && <p role="status">{status.message}</p>}
        {!supported && <p className="modal__hint">În Linux .deb, actualizarea se face prin managerul de pachete sau instalarea noii versiuni. Pe Android, folosește APK-ul release semnat.</p>}
      </div>
      <footer className="modal__footer">
        <button type="button" className="btn" disabled={busy || !supported} onClick={() => void check()}>
          {busy ? 'Se procesează…' : 'Verifică acum'}
        </button>
        {supported && status?.status === 'available' &&
          <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void download()}>Descarcă</button>}
        <button type="button" className="btn" onClick={() => void api.openExternal('https://github.com/anervalens-netizen/pdf-reader/releases')}>Release-uri</button>
        <div className="modal__footer-spacer" />
        <button type="button" className="btn" onClick={onClose}>Închide</button>
      </footer>
    </div>
  </div>
}
