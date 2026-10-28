import { PDFDocument, degrees } from 'pdf-lib'

/**
 * Basic page transformations. Every operation creates a new PDF.
 * The input ArrayBuffer remains unchanged.
 */
const MAX_INPUT_BYTES = 100 * 1024 * 1024
const MAX_PAGES = 1500

function checkInput(data: ArrayBuffer): void {
  if (data.byteLength === 0 || data.byteLength > MAX_INPUT_BYTES) {
    throw new Error('PDF-ul este gol sau depășește 100 MB.')
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

async function loadPdf(data: ArrayBuffer): Promise<PDFDocument> {
  checkInput(data)
  // Encrypted or corrupt documents must fail visibly, not be saved empty.
  return PDFDocument.load(data, { updateMetadata: false })
}

export function parsePageRange(value: string, totalPages: number): number[] {
  if (totalPages < 1 || totalPages > MAX_PAGES) {
    throw new Error('Documentul depășește limita de 1500 pagini pentru editare.')
  }
  const trimmed = value.trim().replace(/–/g, '-')
  if (!trimmed) throw new Error('Introdu paginile dorite, de exemplu 1-3,5.')
  const pages = new Set<number>()
  for (const part of trimmed.split(',')) {
    const match = /^\s*(\d+)\s*(?:-\s*(\d+))?\s*$/.exec(part)
    if (!match) throw new Error('Interval invalid. Folosește 1-3,5.')
    const from = Number(match[1])
    const to = match[2] ? Number(match[2]) : from
    if (from < 1 || to < from || to > totalPages) {
      throw new Error(`Paginile trebuie să fie între 1 și ${totalPages}, în ordine crescătoare.`)
    }
    for (let page = from; page <= to; page++) pages.add(page)
  }
  return [...pages].sort((a, b) => a - b)
}

export async function rotatePdfPage(source: ArrayBuffer, page: number): Promise<ArrayBuffer> {
  const pdf = await loadPdf(source)
  if (!Number.isInteger(page) || page < 1 || page > pdf.getPageCount()) {
    throw new Error('Pagina selectată nu există.')
  }
  const target = pdf.getPage(page - 1)
  target.setRotation(degrees((target.getRotation().angle + 90) % 360))
  return toArrayBuffer(await pdf.save())
}

export async function extractPdfPages(source: ArrayBuffer, pageNumbers: number[]): Promise<ArrayBuffer> {
  const original = await loadPdf(source)
  if (!pageNumbers.length || pageNumbers.length > MAX_PAGES ||
      pageNumbers.some((n) => !Number.isInteger(n) || n < 1 || n > original.getPageCount())) {
    throw new Error('Selecția de pagini nu este validă.')
  }
  const output = await PDFDocument.create()
  const pages = await output.copyPages(original, pageNumbers.map((number) => number - 1))
  pages.forEach((page) => output.addPage(page))
  return toArrayBuffer(await output.save())
}

export async function mergePdfDocuments(sources: ArrayBuffer[]): Promise<ArrayBuffer> {
  if (sources.length < 2 || sources.length > 10) {
    throw new Error('Selectează între 2 și 10 documente.')
  }
  const result = await PDFDocument.create()
  let pageCount = 0
  for (const source of sources) {
    const pdf = await loadPdf(source)
    pageCount += pdf.getPageCount()
    if (pageCount > MAX_PAGES) throw new Error('Documentul rezultat ar depăși 1500 de pagini.')
    const pages = await result.copyPages(pdf, pdf.getPageIndices())
    pages.forEach((page) => result.addPage(page))
  }
  return toArrayBuffer(await result.save())
}

export async function splitPdfAt(source: ArrayBuffer, afterPage: number): Promise<[ArrayBuffer, ArrayBuffer]> {
  const pdf = await loadPdf(source)
  const total = pdf.getPageCount()
  if (!Number.isInteger(afterPage) || afterPage < 1 || afterPage >= total) {
    throw new Error('Alege o pagină de separare înaintea ultimei pagini.')
  }
  const first = await PDFDocument.create()
  const second = await PDFDocument.create()
  const left = await first.copyPages(pdf, Array.from({ length: afterPage }, (_, i) => i))
  const right = await second.copyPages(pdf, Array.from({ length: total - afterPage }, (_, i) => i + afterPage))
  left.forEach((page) => first.addPage(page))
  right.forEach((page) => second.addPage(page))
  return [toArrayBuffer(await first.save()), toArrayBuffer(await second.save())]
}
