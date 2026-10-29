import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { useApp, type SearchHit } from '../state/store'
import { AnnotationLayer, TextLayer } from '../lib/pdf'
import type { PageViewport, PDFPageProxy } from '../lib/pdf'
import {
  pdfQuadToViewport,
  textItemViewportRect,
  viewportRectToQuad,
  type PdfQuad,
  type Rect,
  type TextItemLike,
  type TextStyleLike
} from '../lib/geometry'
import { buildPageIndex, itemsInRange } from '../lib/textIndex'
import { createId, type Annotation, type SignatureAnnotation } from '../lib/annotations'

export interface PageViewProps {
  pageNumber: number
  zoom: number
  hits: SearchHit[]
  activeHitKey: string | null
  signatureImage: string | null
  onCreateAnnotation: (annotation: Annotation) => void
  onRequestNote: (page: number, x: number, y: number) => void
  onPlaceSignature: (page: number, x: number, y: number) => void
  registerElement: (pageNumber: number, element: HTMLElement | null) => void
}

function resolveItemElement(node: Node, map: Map<Element, number>): Element | null {
  let current: Node | null = node
  while (current) {
    if (current instanceof HTMLElement && map.has(current)) return current
    current = current.parentNode
  }
  return null
}

export function PageView({
  pageNumber,
  zoom,
  hits,
  activeHitKey,
  signatureImage,
  onCreateAnnotation,
  onRequestNote,
  onPlaceSignature,
  registerElement
}: PageViewProps): JSX.Element {
  const { state, docRef } = useApp()
  const pageRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const textLayerRef = useRef<HTMLDivElement | null>(null)
  const annotationLayerRef = useRef<HTMLDivElement | null>(null)
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null)
  const spanMapRef = useRef<Map<Element, number>>(new Map())
  const inkPathRef = useRef<number[]>([])
  const [viewport, setViewport] = useState<PageViewport | null>(null)
  const [printReady, setPrintReady] = useState(false)
  const [items, setItems] = useState<TextItemLike[]>([])
  const [styles, setStyles] = useState<Record<string, TextStyleLike>>({})
  const [, forceRender] = useState(0)

  const tool = state.tool
  const color = state.color

  const pageAnnotations = state.annotations.filter((item) => item.page === pageNumber - 1)

  // --- Render the page (canvas + text layer + native annotation layer) -----
  useEffect(() => {
    const doc = docRef.current
    if (!doc) return
    let cancelled = false
    let page: PDFPageProxy | null = null

    const run = async (): Promise<void> => {
      setPrintReady(false)
      page = await doc.getPage(pageNumber)
      if (cancelled) return
      const view = page.getViewport({ scale: zoom })
      setViewport(view)

      const canvas = canvasRef.current
      if (canvas) {
        const dpr = window.devicePixelRatio || 1
        canvas.width = Math.max(1, Math.floor(view.width * dpr))
        canvas.height = Math.max(1, Math.floor(view.height * dpr))
        canvas.style.width = `${Math.floor(view.width)}px`
        canvas.style.height = `${Math.floor(view.height)}px`
        const context = canvas.getContext('2d')
        if (context) {
          renderTaskRef.current?.cancel()
          const task = page.render({
            canvas,
            canvasContext: context,
            viewport: view,
            transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined
          })
          renderTaskRef.current = task
          await task.promise        }
      }

      const content = await page.getTextContent()
      if (cancelled) return
      const textItems = content.items.filter((item) => 'str' in item) as TextItemLike[]
      setItems(textItems)
      setStyles((content.styles ?? {}) as Record<string, TextStyleLike>)

      const container = textLayerRef.current
      if (container) {
        // The text layer is built in a detached container and swapped in only
        // when it is complete, so a cancelled render can never leave the page
        // with an empty (unselectable) text layer.
        try {
          const staging = document.createElement('div')
          const textLayer = new TextLayer({
            textContentSource: content,
            container: staging,
            viewport: view
          })
          await textLayer.render()
          if (cancelled) return
          const map = new Map<Element, number>()
          textLayer.textDivs.forEach((div, index) => map.set(div, index))
          container.setAttribute('style', staging.getAttribute('style') ?? '')
          container.replaceChildren(...staging.childNodes)
          spanMapRef.current = map
        } catch (error) {
          console.warn('[page] text layer failed', error)
        }
      }

      const annotationDiv = annotationLayerRef.current
      if (annotationDiv) {
        try {
          const annotations = await page.getAnnotations()
          if (cancelled) return
          const staging = document.createElement('div')
          const layer = new AnnotationLayer({
            div: staging,
            page,
            viewport: view,
            annotationStorage: doc.annotationStorage
          } as never)
          await layer.render({ annotations } as never)
          if (cancelled) return
          annotationDiv.setAttribute('style', staging.getAttribute('style') ?? '')
          annotationDiv.replaceChildren(...staging.childNodes)
        } catch (error) {
          console.warn('[page] annotation layer failed', error)
        }
      }
      if (!cancelled) setPrintReady(true)
    }

    void run().catch((error) => console.warn('[page] render failed', error))

    return () => {
      cancelled = true
      renderTaskRef.current?.cancel()
      renderTaskRef.current = null
    }
  }, [docRef, pageNumber, zoom])

  // --- Helpers -------------------------------------------------------------
  const toPdfPoint = useCallback(
    (event: { clientX: number; clientY: number }): { x: number; y: number } | null => {
      const element = pageRef.current
      if (!element || !viewport) return null
      const bounds = element.getBoundingClientRect()
      const [x, y] = viewport.convertToPdfPoint(event.clientX - bounds.left, event.clientY - bounds.top)
      return { x, y }
    },
    [viewport]
  )

  const handleMouseUp = useCallback(() => {
    if (tool !== 'highlight' && tool !== 'underline') return
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return
    if (!viewport) return

    const range = selection.getRangeAt(0)
    const map = spanMapRef.current
    const startElement = resolveItemElement(range.startContainer, map)
    const endElement = resolveItemElement(range.endContainer, map)
    if (!startElement || !endElement) return

    const startItem = map.get(startElement)
    const endItem = map.get(endElement)
    if (startItem === undefined || endItem === undefined) return

    const quads: PdfQuad[] = []
    for (let index = startItem; index <= endItem; index += 1) {
      const item = items[index]
      if (!item || !item.str) continue
      const length = item.str.length
      let from = 0
      let to = length
      if (index === startItem) from = Math.min(range.startOffset, length)
      if (index === endItem) to = Math.min(range.endOffset, length)
      if (to <= from) continue

      const rect = textItemViewportRect(viewport, item, styles[item.fontName])
      const leftRatio = length ? from / length : 0
      const rightRatio = length ? to / length : 1
      const adjusted: Rect = {
        x: rect.x + rect.width * leftRatio,
        y: rect.y,
        width: rect.width * (rightRatio - leftRatio),
        height: rect.height
      }
      if (adjusted.width < 0.6) continue
      quads.push(viewportRectToQuad(viewport, adjusted))
    }

    if (quads.length === 0) return

    onCreateAnnotation({
      id: createId(),
      type: tool,
      page: pageNumber - 1,
      color,
      opacity: 0.38,
      createdAt: Date.now(),
      quads,
      text: selection.toString().slice(0, 400)
    })
    selection.removeAllRanges()
  }, [tool, viewport, items, styles, color, onCreateAnnotation, pageNumber])

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (tool === 'note' || tool === 'signature') {
        const point = toPdfPoint(event)
        if (!point) return
        if (tool === 'note') onRequestNote(pageNumber, point.x, point.y)
        else if (signatureImage) onPlaceSignature(pageNumber, point.x, point.y)
        return
      }
      if (tool !== 'draw') return
      const point = toPdfPoint(event)
      if (!point) return
      event.currentTarget.setPointerCapture(event.pointerId)
      inkPathRef.current = [point.x, point.y]
    },
    [tool, toPdfPoint, onRequestNote, onPlaceSignature, pageNumber, signatureImage]
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (tool !== 'draw' || inkPathRef.current.length === 0) return
      const point = toPdfPoint(event)
      if (!point) return
      const path = inkPathRef.current
      const lastX = path[path.length - 2]
      const lastY = path[path.length - 1]
      if (Math.hypot(point.x - lastX, point.y - lastY) < 0.7) return
      path.push(point.x, point.y)
      forceRender((value) => value + 1)
    },
    [tool, toPdfPoint]
  )

  const handlePointerUp = useCallback(() => {
    if (tool !== 'draw') return
    const path = inkPathRef.current
    inkPathRef.current = []
    if (path.length < 4) return
    onCreateAnnotation({
      id: createId(),
      type: 'ink',
      page: pageNumber - 1,
      color,
      opacity: 1,
      createdAt: Date.now(),
      paths: [path],
      width: 1.6
    })
  }, [tool, color, onCreateAnnotation, pageNumber])

  // --- Derived overlay geometry -------------------------------------------
  const highlightRects: { rect: Rect; color: string }[] = []
  const underlineRects: { rect: Rect; color: string }[] = []
  const noteRects: { rect: Rect; annotation: Annotation }[] = []
  const inkPaths: { points: string; annotation: Annotation }[] = []
  const signatureRects: { rect: Rect; annotation: SignatureAnnotation }[] = []

  if (viewport) {
    for (const annotation of pageAnnotations) {
      if (annotation.type === 'highlight') {
        for (const quad of annotation.quads) {
          highlightRects.push({ rect: pdfQuadToViewport(viewport, quad), color: annotation.color })
        }
      } else if (annotation.type === 'underline') {
        for (const quad of annotation.quads) {
          underlineRects.push({ rect: pdfQuadToViewport(viewport, quad), color: annotation.color })
        }
      } else if (annotation.type === 'note') {
        noteRects.push({ rect: pdfQuadToViewport(viewport, annotation.rect), annotation })
      } else if (annotation.type === 'ink') {
        for (const path of annotation.paths) {
          const points: string[] = []
          for (let i = 0; i < path.length; i += 2) {
            const [x, y] = viewport.convertToViewportPoint(path[i], path[i + 1])
            points.push(`${x.toFixed(2)},${y.toFixed(2)}`)
          }
          inkPaths.push({ points: points.join(' '), annotation })
        }
      } else if (annotation.type === 'signature') {
        signatureRects.push({ rect: pdfQuadToViewport(viewport, annotation.rect), annotation })
      }
    }
  }

  const liveInk = useMemo(() => {
    if (!viewport || inkPathRef.current.length < 2) return ''
    const points: string[] = []
    for (let i = 0; i < inkPathRef.current.length; i += 2) {
      const [x, y] = viewport.convertToViewportPoint(inkPathRef.current[i], inkPathRef.current[i + 1])
      points.push(`${x.toFixed(2)},${y.toFixed(2)}`)
    }
    return points.join(' ')
  }, [viewport, items])

  const pageIndex = buildPageIndex(items)
  const hitRects = hits.map((hit) => {
    const ranges = itemsInRange(pageIndex, hit.start, hit.end)
    const rects: Rect[] = []
    for (const range of ranges) {
      const item = items[range.item]
      if (!item) continue
      const rect = textItemViewportRect(viewport!, item, styles[item.fontName])
      const length = item.str.length || 1
      const leftRatio = range.from / length
      const rightRatio = range.to / length
      rects.push({
        x: rect.x + rect.width * leftRatio,
        y: rect.y,
        width: rect.width * (rightRatio - leftRatio),
        height: rect.height
      })
    }
    return { hit, rects }
  })

  const isDrawing = tool === 'draw'

  return (
    <div
      className={`page${isDrawing ? ' page--drawing' : ''}`}
      ref={(element) => {
        pageRef.current = element
        registerElement(pageNumber, element)
      }}
      style={
        viewport
          ? {
              width: `${Math.floor(viewport.width)}px`,
              height: `${Math.floor(viewport.height)}px`,
              ['--total-scale-factor' as string]: String(zoom)
            }
          : undefined
      }
      data-page={pageNumber}
      data-print-ready={printReady ? 'true' : 'false'}
      onMouseUp={handleMouseUp}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <canvas ref={canvasRef} className="page__canvas" />
      <div ref={textLayerRef} className="textLayer" />
      <div ref={annotationLayerRef} className="annotationLayer" />

      <svg className="page__overlay" aria-hidden="true">
        {hitRects.map(({ hit, rects }) =>
          rects.map((rect, index) => (
            <rect
              key={`hit-${hit.start}-${index}`}
              x={rect.x}
              y={rect.y}
              width={rect.width}
              height={rect.height}
              className={`overlay-hit${activeHitKey === `${hit.page}:${hit.start}` ? ' is-active' : ''}`}
            />
          ))
        )}

        {highlightRects.map(({ rect, color: fill }, index) => (
          <rect
            key={`hl-${index}`}
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
            className="overlay-highlight"
            fill={fill}
          />
        ))}

        {underlineRects.map(({ rect, color: stroke }, index) => (
          <line
            key={`ul-${index}`}
            x1={rect.x}
            x2={rect.x + rect.width}
            y1={rect.y + rect.height - 1}
            y2={rect.y + rect.height - 1}
            className="overlay-underline"
            stroke={stroke}
          />
        ))}

        {inkPaths.map(({ points, annotation }, index) => (
          <polyline
            key={`ink-${annotation.id}-${index}`}
            points={points}
            className="overlay-ink"
            stroke={annotation.color}
          />
        ))}

        {liveInk && <polyline points={liveInk} className="overlay-ink" stroke={color} />}

        {noteRects.map(({ rect, annotation }) => (
          <g key={annotation.id} className="overlay-note">
            <rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} rx={3} />
            <path
              d={`M ${rect.x + 4} ${rect.y + rect.height * 0.45} h ${rect.width - 8}
                  M ${rect.x + 4} ${rect.y + rect.height * 0.68} h ${Math.max(4, rect.width - 14)}`}
            />
          </g>
        ))}
      </svg>

      {signatureRects.map(({ rect, annotation }) => (
        <img
          key={annotation.id}
          className="page__signature"
          src={annotation.image}
          alt="Semnătură"
          style={{
            left: `${rect.x}px`,
            top: `${rect.y}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`
          }}
        />
      ))}
    </div>
  )
}
