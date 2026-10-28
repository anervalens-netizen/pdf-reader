import type { TextItemLike } from './geometry'

export interface PageTextIndex {
  /** Full text of the page, used for searching. */
  text: string
  /** Character offset of every text item inside `text`. */
  spans: { start: number; end: number; item: number }[]
}

/**
 * Builds a stable character index over a page's text items.
 * The same index is used by the search engine and by the selection mapper,
 * so both always agree on what a given character means.
 */
export function buildPageIndex(items: TextItemLike[]): PageTextIndex {
  const spans: PageTextIndex['spans'] = []
  let text = ''

  items.forEach((item, index) => {
    const start = text.length
    text += item.str
    if (item.hasEOL) text += '\n'
    spans.push({ start, end: text.length, item: index })
  })

  return { text, spans }
}

/** Finds every occurrence of `query` inside `text`, case-insensitively. */
export function findMatches(text: string, query: string): { start: number; end: number }[] {
  if (!query) return []
  const haystack = text.toLowerCase()
  const needle = query.toLowerCase()
  const matches: { start: number; end: number }[] = []
  let index = haystack.indexOf(needle)
  while (index !== -1) {
    matches.push({ start: index, end: index + needle.length })
    index = haystack.indexOf(needle, index + Math.max(1, needle.length))
    if (matches.length > 5000) break
  }
  return matches
}

/** Character range of the items touched by [start, end). */
export function itemsInRange(
  index: PageTextIndex,
  start: number,
  end: number
): { item: number; from: number; to: number }[] {
  const result: { item: number; from: number; to: number }[] = []
  for (const span of index.spans) {
    if (span.end <= start) continue
    if (span.start >= end) break
    const from = Math.max(0, start - span.start)
    const to = Math.min(span.end - span.start, end - span.start)
    if (to > from) result.push({ item: span.item, from, to })
  }
  return result
}
