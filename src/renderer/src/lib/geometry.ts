import type { PageViewport } from './pdf'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Multiplies two 3x2 affine matrices (same maths as PDF.js' Util.transform).
 * Kept local so this module stays free of runtime PDF.js dependencies.
 */
function transform(m1: number[], m2: number[]): number[] {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
  ]
}

/** Rectangle in PDF user space: [x0, yTop, x1, yBottom] (y grows upwards). */
export type PdfRect = [number, number, number, number]

/** Quadrilateral in PDF user space: 8 numbers, clockwise from top-left. */
export type PdfQuad = number[]

export interface TextItemLike {
  str: string
  transform: number[]
  width: number
  height: number
  fontName: string
  hasEOL?: boolean
}

export interface TextStyleLike {
  fontFamily?: string
  ascent?: number
  descent?: number
  vertical?: boolean
}

/**
 * Bounding box of a text item expressed in CSS pixels of the page container,
 * using the same maths as PDF.js' own text layer so highlights line up exactly.
 */
export function textItemViewportRect(
  viewport: PageViewport,
  item: TextItemLike,
  style: TextStyleLike | undefined
): Rect {
  const tx = transform(viewport.transform, item.transform)
  let angle = Math.atan2(tx[1], tx[0])
  if (style?.vertical) angle += Math.PI / 2

  const fontHeight = Math.hypot(tx[2], tx[3])
  const fontAscent = fontHeight * (style?.ascent ?? 0)

  let left: number
  let top: number
  if (angle === 0) {
    left = tx[4]
    top = tx[5] - fontAscent
  } else {
    left = tx[4] + fontAscent * Math.sin(angle)
    top = tx[5] - fontAscent * Math.cos(angle)
  }

  return {
    x: left,
    y: top,
    width: Math.abs(item.width * viewport.scale),
    height: fontHeight
  }
}

/** Viewport rectangle → PDF user space rectangle. */
export function viewportRectToPdf(viewport: PageViewport, rect: Rect): PdfRect {
  const [x1, yTop] = viewport.convertToPdfPoint(rect.x, rect.y)
  const [x2, yBottom] = viewport.convertToPdfPoint(rect.x + rect.width, rect.y + rect.height)
  return [x1, yTop, x2, yBottom]
}

/** PDF user space rectangle → viewport rectangle. */
export function pdfRectToViewport(viewport: PageViewport, rect: PdfRect): Rect {
  const [x1, y1] = viewport.convertToViewportPoint(rect[0], rect[1])
  const [x2, y2] = viewport.convertToViewportPoint(rect[2], rect[3])
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1)
  }
}

/** Viewport rectangle → PDF quad (4 corners, clockwise from top-left). */
export function viewportRectToQuad(viewport: PageViewport, rect: Rect): PdfQuad {
  const [x1, yTop] = viewport.convertToPdfPoint(rect.x, rect.y)
  const [x2, yBottom] = viewport.convertToPdfPoint(rect.x + rect.width, rect.y + rect.height)
  return [x1, yTop, x2, yTop, x1, yBottom, x2, yBottom]
}

/** PDF quad → viewport rectangle (union of the quad). */
export function pdfQuadToViewport(viewport: PageViewport, quad: PdfQuad): Rect {
  const xs: number[] = []
  const ys: number[] = []
  for (let i = 0; i < quad.length; i += 2) {
    const [x, y] = viewport.convertToViewportPoint(quad[i], quad[i + 1])
    xs.push(x)
    ys.push(y)
  }
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/** Normalise a rectangle so width/height are positive. */
export function normalizeRect(a: number, b: number, c: number, d: number): [number, number, number, number] {
  return [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)]
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return !(a.x + a.width < b.x || b.x + b.width < a.x || a.y + a.height < b.y || b.y + b.height < a.y)
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
