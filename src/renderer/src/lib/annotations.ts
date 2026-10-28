import { PDFDocument, StandardFonts, rgb, BlendMode, LineCapStyle, type PDFPage, type PDFFont } from 'pdf-lib'
import type { PdfQuad, PdfRect } from './geometry'

export type AnnotationType = 'highlight' | 'underline' | 'note' | 'ink' | 'signature'

interface AnnotationBase {
  id: string
  type: AnnotationType
  page: number
  color: string
  opacity: number
  createdAt: number
}

export interface QuadAnnotation extends AnnotationBase {
  type: 'highlight' | 'underline'
  quads: PdfQuad[]
  text?: string
}

export interface NoteAnnotation extends AnnotationBase {
  type: 'note'
  rect: PdfRect
  comment: string
}

export interface InkAnnotation extends AnnotationBase {
  type: 'ink'
  /** One entry per stroke; each stroke is a flat list of PDF coordinates. */
  paths: number[][]
  width: number
}

export interface SignatureAnnotation extends AnnotationBase {
  type: 'signature'
  rect: PdfRect
  image: string
}

export type Annotation =
  | QuadAnnotation
  | NoteAnnotation
  | InkAnnotation
  | SignatureAnnotation

export const HIGHLIGHT_COLORS = ['#ffd94a', '#8ce99a', '#74c0fc', '#ffa8c5', '#ff922b'] as const
export const INK_COLORS = ['#e03131', '#2f9e44', '#1971c2', '#f08c00', '#212529'] as const
export const NOTE_COLOR = '#b4532a'

export function createId(prefix = 'an'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = hex.replace('#', '')
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value
  const int = Number.parseInt(full, 16)
  return {
    r: ((int >> 16) & 255) / 255,
    g: ((int >> 8) & 255) / 255,
    b: (int & 255) / 255
  }
}

function quadBounds(quad: PdfQuad): [number, number, number, number] {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let i = 0; i < quad.length; i += 2) {
    minX = Math.min(minX, quad[i])
    maxX = Math.max(maxX, quad[i])
    minY = Math.min(minY, quad[i + 1])
    maxY = Math.max(maxY, quad[i + 1])
  }
  return [minX, minY, maxX, maxY]
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    if (!current) {
      current = word
    } else if (current.length + word.length + 1 <= maxChars) {
      current += ` ${word}`
    } else {
      lines.push(current)
      current = word
    }
    if (current.length > maxChars) {
      lines.push(current.slice(0, maxChars))
      current = ''
    }
  }
  if (current) lines.push(current)
  return lines.length ? lines : ['']
}

async function drawNote(page: PDFPage, annotation: NoteAnnotation, font: PDFFont): Promise<void> {
  const [x0, y0, x1, y1] = annotation.rect
  const width = Math.max(14, x1 - x0)
  const height = Math.max(14, y1 - y0)
  const color = hexToRgb(annotation.color)

  page.drawRectangle({
    x: x0,
    y: y0,
    width,
    height,
    color: rgb(color.r, color.g, color.b),
    opacity: annotation.opacity,
    borderWidth: 0
  })

  if (!annotation.comment) return

  const size = 9
  const lineHeight = size * 1.25
  const maxChars = Math.max(4, Math.floor((width - 8) / (size * 0.5)))
  const lines = wrapText(annotation.comment, maxChars)
  const maxLines = Math.max(1, Math.floor((height - 8) / lineHeight))
  const shown = lines.slice(0, maxLines)

  page.drawText(shown.join('\n'), {
    x: x0 + 4,
    y: y0 + height - size - 4,
    size,
    font,
    color: rgb(0.12, 0.12, 0.12),
    lineHeight
  })
}

async function drawSignature(
  pdfDoc: PDFDocument,
  page: PDFPage,
  annotation: SignatureAnnotation
): Promise<void> {
  const [x0, y0, x1, y1] = annotation.rect
  const base64 = annotation.image.replace(/^data:image\/png;base64,/, '')
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
  const image = await pdfDoc.embedPng(bytes)
  page.drawImage(image, {
    x: x0,
    y: y0,
    width: Math.max(1, x1 - x0),
    height: Math.max(1, y1 - y0),
    opacity: annotation.opacity
  })
}

export interface ExportOptions {
  /** Form field values captured from the live PDF.js document. */
  formValues?: { name: string; type: string; value: string | boolean }[]
}

export interface ExportResult {
  data: ArrayBuffer
  warnings: string[]
}

/**
 * Writes the annotation model back into a copy of the original document.
 * The original file on disk is never modified.
 */
export async function exportAnnotatedPdf(
  original: ArrayBuffer,
  annotations: Annotation[],
  options: ExportOptions = {}
): Promise<ExportResult> {
  const warnings: string[] = []
  const pdfDoc = await PDFDocument.load(original, { updateMetadata: false })
  const pages = pdfDoc.getPages()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)

  for (const annotation of annotations) {
    const page = pages[annotation.page]
    if (!page) {
      warnings.push(`Adnotare ignorată: pagina ${annotation.page + 1} nu există.`)
      continue
    }
    const color = hexToRgb(annotation.color)

    try {
      switch (annotation.type) {
        case 'highlight': {
          for (const quad of annotation.quads) {
            const [x0, y0, x1, y1] = quadBounds(quad)
            page.drawRectangle({
              x: x0,
              y: y0,
              width: Math.max(0.5, x1 - x0),
              height: Math.max(0.5, y1 - y0),
              color: rgb(color.r, color.g, color.b),
              opacity: annotation.opacity,
              blendMode: BlendMode.Multiply
            })
          }
          break
        }
        case 'underline': {
          for (const quad of annotation.quads) {
            const [x0, y0, x1, y1] = quadBounds(quad)
            const thickness = Math.max(0.8, (y1 - y0) * 0.06)
            page.drawLine({
              start: { x: x0, y: y0 - thickness },
              end: { x: x1, y: y0 - thickness },
              thickness,
              color: rgb(color.r, color.g, color.b),
              opacity: annotation.opacity
            })
          }
          break
        }
        case 'note': {
          await drawNote(page, annotation, font)
          break
        }
        case 'ink': {
          for (const path of annotation.paths) {
            for (let i = 0; i + 3 < path.length; i += 2) {
              page.drawLine({
                start: { x: path[i], y: path[i + 1] },
                end: { x: path[i + 2], y: path[i + 3] },
                thickness: annotation.width,
                color: rgb(color.r, color.g, color.b),
                opacity: annotation.opacity,
                lineCap: LineCapStyle.Round
              })
            }
          }
          break
        }
        case 'signature': {
          await drawSignature(pdfDoc, page, annotation)
          break
        }
      }
    } catch (error) {
      warnings.push(`Adnotare ${annotation.type} exportată cu erori: ${String(error)}`)
    }
  }

  if (options.formValues?.length) {
    try {
      const form = pdfDoc.getForm()
      for (const entry of options.formValues) {
        try {
          if (entry.type === 'text' && typeof entry.value === 'string') {
            form.getTextField(entry.name).setText(entry.value)
          } else if (entry.type === 'checkbox' && typeof entry.value === 'boolean') {
            const box = form.getCheckBox(entry.name)
            if (entry.value) box.check()
            else box.uncheck()
          } else if (entry.type === 'radio' && typeof entry.value === 'string') {
            form.getRadioGroup(entry.name).select(entry.value)
          } else if (entry.type === 'dropdown' && typeof entry.value === 'string') {
            form.getDropdown(entry.name).select(entry.value)
          }
        } catch {
          /* field not writable in this document — skip silently */
        }
      }
    } catch (error) {
      warnings.push(`Valorile formularului nu au putut fi aplicate: ${String(error)}`)
    }
  }

  const bytes = await pdfDoc.save()
  return {
    data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    warnings
  }
}
