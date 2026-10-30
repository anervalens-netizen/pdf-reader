// Render original vector PDF bytes through the browser PDF plugin, not through
// application page canvases. Works independently of UI zoom and page count.
export async function printPdfBlob(data: ArrayBuffer): Promise<void> {
  const blob = new Blob([data], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  let cleanupTimer: number | undefined
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('Cititorul de imprimare nu a răspuns.')), 15000)
      frame.onload = () => {
        window.clearTimeout(timer)
        window.setTimeout(() => {
          try {
            if (!frame.contentWindow) throw new Error('Cititor PDF indisponibil.')
            frame.contentWindow.focus()
            frame.contentWindow.print()
            resolve()
          } catch (error) { reject(error) }
        }, 350)
      }
      frame.onerror = () => { window.clearTimeout(timer); reject(new Error('PDF-ul nu a putut fi deschis pentru imprimare.')) }
      frame.src = url
      document.body.appendChild(frame)
    })
    // Keep the blob alive while the print dialog/spooler reads the PDF.
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
