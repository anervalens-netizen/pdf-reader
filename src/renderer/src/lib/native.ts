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
