import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor wraps the very same web build that powers the PWA into a native
 * Android shell: a WebView with the SAF file picker, a back button that
 * closes the document and the same IndexedDB storage.
 */
const config: CapacitorConfig = {
  appId: 'com.pdf.reader',
  appName: 'PDF',
  webDir: 'dist-web',
  android: {
    backgroundColor: '#F7F5F2',
    allowMixedContent: false
  },
  server: {
    androidScheme: 'https'
  }
}

export default config
