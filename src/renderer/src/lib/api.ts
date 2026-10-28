import type { PdfApi } from '../../../shared/api'

declare global {
  interface Window {
    pdf: PdfApi
  }
}

export const api: PdfApi = window.pdf

export const isDesktop = typeof window.pdf !== 'undefined'
