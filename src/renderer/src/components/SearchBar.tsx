import { useEffect, useRef, type JSX } from 'react'
import { useApp } from '../state/store'
import { Icon } from './Icon'

export function SearchBar(): JSX.Element {
  const { state, dispatch, runSearch, goToHit, jumpToHit } = useApp()
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (state.searchOpen) inputRef.current?.focus()
  }, [state.searchOpen])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void runSearch(state.query)
    }, 220)
    return () => window.clearTimeout(timer)
  }, [state.query, runSearch])

  if (!state.searchOpen) return <></>

  const total = state.hits.length
  const current = state.hitIndex >= 0 ? state.hitIndex + 1 : 0

  return (
    <div className="searchbar" role="search">
      <div className="searchbar__field">
        <Icon name="search" size={15} />
        <input
          ref={inputRef}
          className="searchbar__input"
          type="search"
          placeholder="Caută în document…"
          aria-label="Caută în document"
          value={state.query}
          onChange={(event) => dispatch({ type: 'search/query', query: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              goToHit(event.shiftKey ? -1 : 1)
            } else if (event.key === 'Escape') {
              dispatch({ type: 'search/close' })
            }
          }}
        />
      </div>
      <span className="searchbar__count">
        {state.searching ? '…' : total ? `${current} / ${total}` : state.query ? '0 rezultate' : ''}
      </span>
      <button
        type="button"
        className="icon-btn icon-btn--sm"
        title="Rezultatul anterior (Shift+Enter)"
        aria-label="Rezultatul anterior"
        disabled={!total}
        onClick={() => goToHit(-1)}
      >
        <Icon name="chevronLeft" size={15} />
      </button>
      <button
        type="button"
        className="icon-btn icon-btn--sm"
        title="Rezultatul următor (Enter)"
        aria-label="Rezultatul următor"
        disabled={!total}
        onClick={() => goToHit(1)}
      >
        <Icon name="chevronRight" size={15} />
      </button>
      <button
        type="button"
        className="icon-btn icon-btn--sm"
        title="Închide căutarea (Esc)"
        aria-label="Închide căutarea"
        onClick={() => dispatch({ type: 'search/close' })}
      >
        <Icon name="close" size={15} />
      </button>

      {total > 0 && (
        <div className="searchbar__list" role="listbox" aria-label="Rezultate">
          {state.hits.slice(0, 50).map((hit, index) => (
            <button
              key={`${hit.page}-${hit.start}-${index}`}
              type="button"
              role="option"
              aria-selected={index === state.hitIndex}
              className={`searchbar__hit${index === state.hitIndex ? ' is-active' : ''}`}
              onClick={() => jumpToHit(index)}
            >
              <span className="searchbar__hit-page">p. {hit.page}</span>
              <span className="searchbar__hit-text">{state.query}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
