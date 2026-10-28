import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export const {
  getDocument,
  GlobalWorkerOptions,
  AnnotationMode,
  AnnotationLayer,
  TextLayer,
  PasswordResponses,
  Util,
  version
} = pdfjs

export type PDFDocumentProxy = pdfjs.PDFDocumentProxy
export type PDFPageProxy = pdfjs.PDFPageProxy
export type PageViewport = pdfjs.PageViewport

/** Runtime assets copied next to the bundle by vite-plugin-static-copy. */
export const CMAP_URL = './cmaps/'
export const STANDARD_FONT_DATA_URL = './standard_fonts/'
export const WASM_URL = './wasm/'

export interface LoadOptions {
  password?: string
  onProgress?: (loaded: number, total: number) => void
}

export async function loadDocument(data: ArrayBuffer, options: LoadOptions = {}): Promise<PDFDocumentProxy> {
  const task = getDocument({
    data: new Uint8Array(data),
    cMapUrl: CMAP_URL,
    cMapPacked: true,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    wasmUrl: WASM_URL,
    password: options.password,
    useSystemFonts: true
  })

  if (options.onProgress) {
    task.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
      options.onProgress?.(loaded, total)
    }
  }

  return task.promise
}
