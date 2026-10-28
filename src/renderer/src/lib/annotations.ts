import { PDFBool, PDFDict, PDFDocument, PDFHexString, PDFName, rgb, BlendMode, LineCapStyle, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
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

async function drawNote(pdfDoc: PDFDocument, page: PDFPage, annotation: NoteAnnotation): Promise<void> {
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

  // The icon is visual; the entire comment belongs in an interoperable PDF
  // Text annotation. The small marker cannot hold more than a few characters.
  const noteRef = pdfDoc.context.register(pdfDoc.context.obj({
    Type: 'Annot',
    Subtype: 'Text',
    Rect: [x0, y0, x1, y1],
    Contents: PDFHexString.fromText(annotation.comment),
    Name: 'Comment',
    F: 4
  }))
  page.node.addAnnot(noteRef)

  // Do not rasterize or truncate the comment inside its 22pt icon. PDF
  // viewers can display the full Unicode text from the Text annotation.
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
  /** Font bytes for embedding Unicode widget appearance glyphs. */
  unicodeFontBytes?: Uint8Array
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
          await drawNote(pdfDoc, page, annotation)
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
          // PDF.js uses AcroForm names Tx/Btn/Ch, not pdf-lib's field names.
          if ((entry.type === 'Tx' || entry.type === 'text') && typeof entry.value === 'string') {
            form.getTextField(entry.name).setText(entry.value)
          } else if ((entry.type === 'Btn' || entry.type === 'checkbox') && typeof entry.value === 'boolean') {
            const box = form.getCheckBox(entry.name)
            if (entry.value) box.check()
            else box.uncheck()
          } else if ((entry.type === 'Btn' || entry.type === 'radio') && typeof entry.value === 'string') {
            form.getRadioGroup(entry.name).select(entry.value)
          } else if ((entry.type === 'Ch' || entry.type === 'dropdown') && typeof entry.value === 'string') {
            form.getDropdown(entry.name).select(entry.value)
          } else {
            warnings.push(`Câmpul formularului „${entry.name}” are un tip neacceptat (${entry.type}).`)
          }
        } catch (error) {
          warnings.push(`Câmpul „${entry.name}” nu a fost salvat: ${String(error)}`)
        }
      }
    } catch (error) {
      warnings.push(`Valorile formularului nu au putut fi aplicate: ${String(error)}`)
    }
  }

  // WinAnsi Helvetica cannot draw Romanian diacritics in widget appearances.
  // Validate every edited glyph BEFORE generating a new appearance; fontkit
  // silently substitutes missing glyphs (for example CJK or emoji).
  let deferAppearancesToReader = false
  const editedText = options.formValues?.filter((field) => typeof field.value === 'string') ?? []
  const requiresUnicode = editedText.some((field) => /[^\u0000-\u007f]/u.test(field.value as string))
  if (options.unicodeFontBytes?.byteLength && requiresUnicode) {
    try {
      const parsedFont = fontkit.create(options.unicodeFontBytes)
      const missingGlyphs = editedText.flatMap((field) => [...(field.value as string)])
        .filter((char) => !parsedFont.hasGlyphForCodePoint(char.codePointAt(0)!))
      if (missingGlyphs.length > 0) {
        deferAppearancesToReader = true
        warnings.push('Fontul inclus nu acoperă toate caracterele formularului. Textul este păstrat, dar aspectul vizual trebuie verificat în cititorul PDF.')
      } else {
        pdfDoc.registerFontkit(fontkit)
        const unicodeFont = await pdfDoc.embedFont(options.unicodeFontBytes, { subset: true })
        pdfDoc.getForm().updateFieldAppearances(unicodeFont)
      }
    } catch (error) {
      deferAppearancesToReader = true
      warnings.push('Fontul Unicode nu a putut genera aspectul formularului: ' + String(error))
    }
  }

  if (deferAppearancesToReader) {
    const formRef = pdfDoc.catalog.get(PDFName.of('AcroForm'))
    if (formRef) pdfDoc.context.lookup(formRef, PDFDict).set(PDFName.of('NeedAppearances'), PDFBool.True)
  }

  let bytes: Uint8Array
  try {
    bytes = await pdfDoc.save({ updateFieldAppearances: !deferAppearancesToReader })
  } catch (error) {
    // pdf-lib's built-in Helvetica cannot draw Romanian diacritics in form
    // appearances. Keep the correct Unicode /V value instead of failing the
    // entire export. Readers can regenerate visual appearances when opened.
    if (!String(error).includes('WinAnsi cannot encode')) throw error
    const formRef = pdfDoc.catalog.get(PDFName.of('AcroForm'))
    if (formRef) {
      const formDict = pdfDoc.context.lookup(formRef, PDFDict)
      formDict.set(PDFName.of('NeedAppearances'), PDFBool.True)
    }
    bytes = await pdfDoc.save({ updateFieldAppearances: false })
    warnings.push('Formularul conține diacritice: valorile sunt păstrate, dar aspectul câmpurilor trebuie verificat în cititorul PDF.')
  }
  return {
    data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    warnings
  }
}
