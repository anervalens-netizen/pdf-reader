// Print the vector export through Chromium PDF viewer. An AbortSignal
// invalidates pending iframe loading/print when the user switches documents.
export async function printPdfBlob(data: ArrayBuffer, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new Error('Imprimarea a fost anulată.')
  const blob = new Blob([data], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  let cleanupTimer: number | undefined
  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false
      let printDelay: number | undefined
      const finish = (error?: Error): void => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        if (printDelay !== undefined) window.clearTimeout(printDelay)
        signal?.removeEventListener('abort', aborted)
        if (error) reject(error)
        else resolve()
      }
      const aborted = (): void => finish(new Error('Imprimarea a fost anulată: documentul s-a schimbat.'))
      const timer = window.setTimeout(() => finish(new Error('Cititorul de imprimare nu a răspuns.')), 15000)
      signal?.addEventListener('abort', aborted, { once: true })
      if (signal?.aborted) return aborted()
      frame.onload = () => {
        printDelay = window.setTimeout(() => {
          if (signal?.aborted) return aborted()
          try {
            if (!frame.contentWindow) throw new Error('Cititor PDF indisponibil.')
            frame.contentWindow.focus()
            if (signal?.aborted) return aborted()
            frame.contentWindow.print()
            finish()
          } catch (error) { finish(error instanceof Error ? error : new Error(String(error))) }
        }, 350)
      }
      frame.onerror = () => finish(new Error('PDF-ul nu a putut fi deschis pentru imprimare.'))
      frame.src = url
      document.body.appendChild(frame)
    })
    cleanupTimer = window.setTimeout(() => {
      frame.remove()
      URL.revokeObjectURL(url)
    }, 60000)
  } catch (error) {
    if (cleanupTimer) window.clearTimeout(cleanupTimer)
    frame.remove()
    URL.revokeObjectURL(url)
    throw error
  }
}
