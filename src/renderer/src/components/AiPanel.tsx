import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { useApp } from '../state/store'
import type { PdfAiApi, AiResponseEvent, AiStatus } from '../../../shared/api'
import { Icon } from './Icon'

declare global {
  interface Window { pdfAi?: PdfAiApi }
}

type Message = { role: 'user' | 'assistant'; content: string }
const MAX_DOCUMENT_CHARS = 140_000
const MAX_CHAT_HISTORY_CHARS = 38_000

// In-memory, per-document chat cache. Never upload or save automatically.
const sessionChats = new Map<string, Message[]>()

function PageLinks({ text, totalPages, jump }: {
  text: string; totalPages: number; jump: (page: number) => void
}): JSX.Element {
  const parts = text.split(/(\[(?:p\.|pagina)\s*\d+\])/gi)
  return <span>{parts.map((part, i) => {
    const match = /^\[(?:p\.|pagina)\s*(\d+)\]$/i.exec(part)
    const n = match ? Number(match[1]) : 0
    return n > 0 && n <= totalPages
      ? <button type="button" key={i} className="ai-page-ref" onClick={() => jump(n)}>{part}</button>
      : <span key={i}>{part}</span>
  })}</span>
}

async function documentText(doc: NonNullable<ReturnType<typeof useApp>['docRef']['current']>, fileName: string): Promise<string> {
  const parts = ['Document: ' + fileName, 'Pagini: ' + doc.numPages]
  let length = parts.join('\n').length
  for (let page = 1; page <= doc.numPages && length < MAX_DOCUMENT_CHARS; page += 1) {
    const pdfPage = await doc.getPage(page)
    const data = await pdfPage.getTextContent()
    const text = data.items.filter((item) => 'str' in item)
      .map((item) => ('str' in item ? item.str : '')).join(' ')
    const chunk = '\n[p. ' + page + ']\n' + text
    parts.push(chunk.slice(0, MAX_DOCUMENT_CHARS - length))
    length += chunk.length
    if (page % 20 === 0) await new Promise((resolve) => setTimeout(resolve, 0))
  }
  if (length >= MAX_DOCUMENT_CHARS) parts.push('\n[Text trunchiat la 140.000 caractere; este posibil ca paginile următoare să lipsească.]')
  return parts.join('')
}

export function AiPanel({ onClose }: { onClose: () => void }): JSX.Element {
  const { state, docRef, setPage } = useApp()
  const ai = window.pdfAi
  const documentKey = state.file?.path ?? ''
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [models, setModels] = useState<{ id: string; name: string }[]>([])
  const [model, setModel] = useState('')
  const [messages, setMessages] = useState<Message[]>(() => sessionChats.get(documentKey) ?? [])
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')
  const activeId = useRef<string | null>(null)
  const busyRef = useRef(false)
  const documentKeyRef = useRef(documentKey)

  useEffect(() => {
    documentKeyRef.current = documentKey
    setMessages(sessionChats.get(documentKey) ?? [])
    setError('')
  }, [documentKey])

  useEffect(() => {
    if (!ai) return
    let alive = true
    void ai.status().then((next) => { if (alive) setStatus(next) })
      .catch((err) => { if (alive) setError(String(err)) })
    return () => { alive = false }
  }, [ai])

  useEffect(() => {
    if (!ai || !status?.connected) return
    let alive = true
    void ai.models().then((result) => {
      if (!alive) return
      if (!result.ok) { setError(result.error ?? 'Lista modelelor nu este disponibilă.'); return }
      setModels(result.models ?? [])
      setModel((current) => result.models?.some((entry) => entry.id === current)
        ? current : (result.models?.[0]?.id ?? ''))
    }).catch((err) => { if (alive) setError(String(err)) })
    return () => { alive = false }
  }, [ai, status?.connected])

  useEffect(() => {
    if (!ai) return
    const listener = (event: AiResponseEvent): void => {
      if (event.id !== activeId.current) return
      if (event.type === 'delta') {
        setMessages((prior) => {
          if (prior.length === 0) return prior
          const next = [...prior]
          const last = next[next.length - 1]
          if (last.role === 'assistant') next[next.length - 1] = { ...last, content: last.content + (event.text ?? '') }
          sessionChats.set(documentKeyRef.current, next)
          return next
        })
      } else {
        if (event.type === 'error') setError(event.message ?? 'Răspunsul AI a eșuat.')
        activeId.current = null
        busyRef.current = false
        setBusy(false)
      }
    }
    const unsubscribe = ai.onEvent(listener)
    return () => {
      unsubscribe()
      const id = activeId.current
      if (id) void ai.cancel(id).catch(() => {})
      activeId.current = null
    }
  }, [ai])

  const connect = useCallback(async () => {
    if (!ai || connecting) return
    setConnecting(true)
    setError('')
    try {
      const result = await ai.signIn()
      if (!result.ok || !result.status) throw new Error(result.error || 'Autentificarea a eșuat.')
      setStatus(result.status)
    } catch (err) { setError(String(err)) }
    finally { setConnecting(false) }
  }, [ai, connecting])

  const send = useCallback(async () => {
    const doc = docRef.current
    const text = question.trim()
    if (!ai || !doc || !state.file || !text || !model || busyRef.current) return
    setError('')
    setQuestion('')
    busyRef.current = true
    setBusy(true)
    const id = crypto.randomUUID()
    activeId.current = id
    const prior = messages
    const next: Message[] = [...prior, { role: 'user', content: text }, { role: 'assistant', content: '' }]
    setMessages(next)
    sessionChats.set(documentKey, next)
    try {
      const documentContent = await documentText(doc, state.file.name)
      if (docRef.current !== doc || state.file.path !== documentKey) throw new Error('Documentul s-a schimbat.')
      const previous: Message[] = []
      let historyLength = 0
      for (let i = prior.length - 1; i >= 0; i--) {
        if (!prior[i].content || historyLength + prior[i].content.length > MAX_CHAT_HISTORY_CHARS) break
        previous.unshift(prior[i])
        historyLength += prior[i].content.length
      }
      const request = {
        id, model,
        instructions: 'Răspunde în limba română, exclusiv pe baza textului furnizat. Pentru informații din document citează exact pagina folosind [p. N]. Dacă documentul nu conține răspunsul, spune clar. Nu inventa citări.',
        messages: [{ role: 'user' as const, content: 'Contextul documentului PDF:\n' + documentContent },
          ...previous, { role: 'user' as const, content: text }]
      }
      await ai.ask(request)
    } catch (err) {
      if (activeId.current !== id) return
      activeId.current = null
      busyRef.current = false
      setBusy(false)
      setError(String(err))
      setMessages(prior)
      sessionChats.set(documentKey, prior)
    }
  }, [ai, docRef, state.file, model, question, messages, documentKey])

  const disconnect = async (): Promise<void> => {
    if (!ai) return
    setError('')
    try {
      setStatus(await ai.signOut())
      setModels([])
      setModel('')
    } catch (err) { setError(String(err)) }
  }

  const cancel = (): void => {
    if (ai && activeId.current) void ai.cancel(activeId.current)
  }

  return (
    <aside className="ai-panel" aria-label="ChatGPT pentru PDF">
      <header className="ai-panel__header">
        <strong><Icon name="sparkles" size={18} /> Întreabă ChatGPT</strong>
        <button type="button" className="icon-btn" title="Închide" aria-label="Închide AI" onClick={onClose}><Icon name="close" /></button>
      </header>
      {!ai ? <p>AI este disponibil doar în aplicația desktop.</p>
        : status && !status.connected ? (
          <div className="ai-panel__empty">
            <h3>Conectează abonamentul ChatGPT</h3>
            <p>Conectarea este opțională. Aplicația nu are nevoie de o cheie API. Accesul la document este transmis către OpenAI numai după ce trimiți o întrebare.</p>
            <button className="btn btn--primary" type="button" disabled={connecting} onClick={() => void connect()}>
              {connecting ? 'Autentificare în browser…' : 'Continue with ChatGPT'}
            </button>
          </div>
        ) : status?.connected ? <>
          <div className="ai-panel__account">
            <span>{status.email || status.name || 'ChatGPT conectat'}</span>
            <button type="button" onClick={() => void disconnect()} title="Deconectează contul">Deconectează</button>
          </div>
          <div className="ai-panel__config">
            <label htmlFor="ai-model">Model AI</label>
            <select id="ai-model" value={model} onChange={(event) => setModel(event.target.value)}
              disabled={busy || !models.length}>
              {!models.length && <option value="">Modele indisponibile</option>}
              {models.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
          <div className="ai-panel__messages" aria-live="polite">
            {!messages.length && <p className="ai-panel__placeholder">Poți întreba despre conținutul PDF-ului. Răspunsurile pot include referințe către pagini.</p>}
            {messages.map((msg, index) => (
              <div key={index} className={'ai-message ai-message--' + msg.role}>
                <span className="ai-message__role">{msg.role === 'user' ? 'Tu' : 'ChatGPT'}</span>
                <div className="ai-message__text">{msg.role === 'assistant'
                  ? <PageLinks text={msg.content || (busy ? '…' : '')} totalPages={state.numPages} jump={setPage} />
                  : msg.content}</div>
              </div>
            ))}
          </div>
          <div className="ai-panel__compose">
            <textarea aria-label="Întrebare pentru ChatGPT" placeholder="Întreabă despre document…" rows={3}
              value={question} onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() }
              }} />
            <div className="ai-panel__actions">
              <small>Doar textul PDF-ului, maximum 140.000 de caractere. Fără imagini sau fișiere brute.</small>
              {busy ? <button className="btn" type="button" onClick={cancel}>Oprește</button>
                : <button className="btn btn--primary" type="button" disabled={!question.trim() || !model} onClick={() => void send()}>Trimite</button>}
            </div>
          </div>
        </> : <p>Se verifică conexiunea…</p>}
      {error && <div className="ai-panel__error" role="alert">{error}</div>}
    </aside>
  )
}
