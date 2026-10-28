import type { PdfApi } from '../../../shared/api'
import { webApi } from './webApi'

declare global {
  interface Window {
    pdf: PdfApi
  }
}

/**
 * True when the renderer runs inside the Electron shell (the preload script
 * exposes `window.pdf`). In the browser - PWA or Android shell - the same
 * contract is served by the browser implementation.
 */
export const isDesktop = typeof window !== 'undefined' && typeof window.pdf !== 'undefined'

export const api: PdfApi = isDesktop ? window.pdf : webApi
