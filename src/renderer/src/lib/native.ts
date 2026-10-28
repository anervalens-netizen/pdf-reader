/**
 * Android shell helpers.
 *
 * The Capacitor runtime only exists inside the native Android build, so the
 * plugin is imported lazily: the desktop (Electron) and PWA bundles never
 * load it and never touch a native bridge.
 */
interface CapacitorGlobal {
  isNativePlatform?: () => boolean
}

interface AppPlugin {
  addListener(
    event: 'backButton',
    handler: () => void
  ): Promise<{ remove: () => Promise<void> }>
  exitApp(): void
}

interface NativeSaveResult {
  canceled: boolean
  path?: string
  error?: string
}

interface NativeIncomingPdf {
  available: boolean
  fileName?: string
  base64?: string
}

interface PdfFilesPlugin {
  savePdf(options: { fileName: string; base64: string }): Promise<NativeSaveResult>
  getPendingPdf(): Promise<NativeIncomingPdf>
  addListener(eventName: string, callback: (payload: NativeIncomingPdf & { message?: string }) => void): Promise<{ remove(): Promise<void> }>
}

/** Open PDFs shared by Android's system file manager (ACTION_VIEW). */
export async function registerPdfIntentHandler(
  onOpen: (file: File) => void,
  onError: (message: string) => void
): Promise<() => void> {
  if (!isNativeShell()) return () => {}
  const { registerPlugin } = await import('@capacitor/core')
  const plugin = registerPlugin<PdfFilesPlugin>('PdfFiles')
  const deliver = (payload: NativeIncomingPdf): void => {
    if (!payload.available || !payload.base64) return
    try {
      const binary = atob(payload.base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      onOpen(new File([bytes], payload.fileName ?? 'document.pdf', { type: 'application/pdf' }))
    } catch (error) {
      onError('Importul PDF a eșuat: ' + String(error))
    }
  }
  const opened = await plugin.addListener('pdfOpened', deliver)
  const errors = await plugin.addListener('pdfOpenError', (event) => onError(event.message ?? 'PDF invalid'))
  try { deliver(await plugin.getPendingPdf()) }
  catch (error) { onError('Nu s-a putut deschide PDF-ul extern: ' + String(error)) }
  return () => { void opened.remove(); void errors.remove() }
}

/** Save through Android's system document picker (SAF); no external-storage permission. */
export async function savePdfOnAndroid(fileName: string, data: ArrayBuffer): Promise<NativeSaveResult> {
  if (!isNativeShell()) throw new Error('Android native shell unavailable')
  // FileReader converts binary without a massive String.fromCharCode spread.
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('PDF read failed'))
    reader.onload = () => {
      const result = String(reader.result ?? '')
      const separator = result.indexOf(',')
      if (separator < 0) reject(new Error('Could not encode PDF'))
      else resolve(result.slice(separator + 1))
    }
    reader.readAsDataURL(new Blob([data], { type: 'application/pdf' }))
  })
  const { registerPlugin } = await import('@capacitor/core')
  const files = registerPlugin<PdfFilesPlugin>('PdfFiles')
  return files.savePdf({ fileName, base64 })
}

/** True when the renderer runs inside the Capacitor (Android) shell. */
export function isNativeShell(): boolean {
  const capacitor = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor
  return Boolean(capacitor?.isNativePlatform?.())
}

/**
 * Wires the Android hardware back button.
 *
 * `onBack` returns true when the event was consumed (a dialog was closed or
 * the document was closed); when it returns false the app exits.
 */
export async function registerBackHandler(onBack: () => boolean): Promise<void> {
  if (!isNativeShell()) return
  try {
    const module = await import('@capacitor/app')
    const app = module.App as unknown as AppPlugin
    await app.addListener('backButton', () => {
      if (!onBack()) app.exitApp()
    })
  } catch (error) {
    console.warn('[native] back button handler unavailable', error)
  }
}
