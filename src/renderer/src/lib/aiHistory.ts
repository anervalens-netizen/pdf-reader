// Leave two IPC slots for PDF context and latest user question.
export const MAX_PRIOR_MESSAGES = 18
export const MAX_PRIOR_CHARS = 38_000
export interface ChatMessage { role: 'user' | 'assistant'; content: string }

// Preserve complete recent turns. Incomplete/stopped answers never go to the API.
export function selectAiHistory(messages: ChatMessage[]): ChatMessage[] {
  const selected: ChatMessage[] = []
  let length = 0
  for (let i = messages.length - 2; i >= 0; i -= 2) {
    const question = messages[i]
    const answer = messages[i + 1]
    if (question?.role !== 'user' || answer?.role !== 'assistant' || !answer.content.trim()) continue
    const nextChars = question.content.length + answer.content.length
    if (selected.length + 2 > MAX_PRIOR_MESSAGES || length + nextChars > MAX_PRIOR_CHARS) break
    selected.unshift(question, answer)
    length += nextChars
  }
  return selected
}


// A late response must match both the in-flight request and the PDF on screen.
// This check is used before any React state update, not only before persistence.
export function aiEventMatchesDocument(
  eventId: string,
  activeId: string | null,
  requestDocumentKey: string | null,
  displayedDocumentKey: string,
): boolean {
  return Boolean(activeId && requestDocumentKey && eventId === activeId &&
    requestDocumentKey === displayedDocumentKey)
}
