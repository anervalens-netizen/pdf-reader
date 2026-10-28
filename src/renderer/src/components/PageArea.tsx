import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { useApp } from '../state/store'
import { PageView } from './PageView'
import { SearchBar } from './SearchBar'
import type { Annotation } from '../lib/annotations'

const PAGE_GAP = 20
const DEFAULT_SIZE = { width: 595, height: 842 }

interface PageAreaProps {
  signatureImage: string | null
  onPlaceSignature: (page: number, x: number, y: number) => void
  onRequestNote: (page: number, x: number, y: number) => void
}

interface PageSize {
  width: number
  height: number
}

function PageSlot({
  pageNumber,
  size,
  zoom,
  root,
  hits,
  activeHitKey,
  signatureImage,
  onCreateAnnotation,
  onRequestNote,
  onPlaceSignature,
  onVisible,
  registerElement
}: {
  pageNumber: number
  size: PageSize
  zoom: number
  root: HTMLElement | null
  hits: ReturnType<typeof useApp>['state']['hits']
  activeHitKey: string | null
  signatureImage: string | null
  onCreateAnnotation: (annotation: Annotation) => void
  onRequestNote: (page: number, x: number, y: number) => void
  onPlaceSignature: (page: number, x: number, y: number) => void
  onVisible: (page: number) => void
  registerElement: (page: number, element: HTMLElement | null) => void
}): JSX.Element {
  const [near, setNear] = useState(false)
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const element = hostRef.current
    if (!element) return
    const observer = new IntersectionObserver(
      (entries) => {
        // Unmount distant page canvas/text layers to bound memory on large PDFs.
        setNear(entries.some((entry) => entry.isIntersecting))
      },
      { root, rootMargin: '1000px 0px' }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [root])

  // Page navigation must target stable slot elements, even while the costly
  // PageView/canvas is unmounted. Never unregister a slot on scroll.
  useEffect(() => {
    registerElement(pageNumber, hostRef.current)
    return () => registerElement(pageNumber, null)
  }, [pageNumber, registerElement])

  return (
    <div
      className="page-slot"
      ref={hostRef}
      style={{
        width: `${Math.round(size.width * zoom)}px`,
        height: `${Math.round(size.height * zoom)}px`
      }}
      data-slot={pageNumber}
    >
      {near && (
        <PageView
          pageNumber={pageNumber}
          zoom={zoom}
          hits={hits}
          activeHitKey={activeHitKey}
          signatureImage={signatureImage}
          onCreateAnnotation={onCreateAnnotation}
          onRequestNote={onRequestNote}
          onPlaceSignature={onPlaceSignature}
          onVisible={onVisible}
          registerElement={() => { /* slot owns the stable navigation anchor */ }}
        />
      )}
    </div>
  )
}

export function PageArea({
  signatureImage,
  onPlaceSignature,
  onRequestNote
}: PageAreaProps): JSX.Element {
  const { state, docRef, setZoom, zoomBy, setPage, addAnnotation } = useApp()
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [sizes, setSizes] = useState<Map<number, PageSize>>(new Map())
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const lastFitRef = useRef<number>(-1)
  const programmaticRef = useRef(false)
  const pagesRef = useRef<Map<number, HTMLElement>>(new Map())

  const pages = useMemo(() => Array.from({ length: state.numPages }, (_, index) => index + 1), [state.numPages])

  // --- Page dimensions ------------------------------------------------------
  useEffect(() => {
    const doc = docRef.current
    if (!doc || state.numPages === 0) {
      setSizes(new Map())
      return
    }
    let cancelled = false

    const load = async (): Promise<void> => {
      const collected = new Map<number, PageSize>()
      const first = await doc.getPage(1)
      const firstViewport = first.getViewport({ scale: 1 })
      collected.set(1, { width: firstViewport.width, height: firstViewport.height })
      if (!cancelled) setSizes(new Map(collected))

      for (let pageNumber = 2; pageNumber <= doc.numPages; pageNumber += 1) {
        if (cancelled) return
        try {
          const page = await doc.getPage(pageNumber)
          const viewport = page.getViewport({ scale: 1 })
          collected.set(pageNumber, { width: viewport.width, height: viewport.height })
        } catch {
          /* keep the default size */
        }
        if (pageNumber % 20 === 0) {
          if (!cancelled) setSizes(new Map(collected))
          await new Promise((resolve) => setTimeout(resolve, 0))
        }
      }
      if (!cancelled) setSizes(new Map(collected))
    }

    void load().catch((error) => console.warn('[pages] size scan failed', error))
    return () => {
      cancelled = true
    }
  }, [docRef, state.numPages, state.file?.path])

  // --- Container size -------------------------------------------------------
  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // --- Fit zoom -------------------------------------------------------------
  useEffect(() => {
    if (!state.file || state.zoomMode === 'custom') return
    if (containerSize.width === 0) return
    const size = sizes.get(1) ?? DEFAULT_SIZE
    const availableWidth = containerSize.width - PAGE_GAP * 2 - 24
    const availableHeight = containerSize.height - PAGE_GAP * 2 - 24
    const scaleWidth = availableWidth / size.width
    const scaleHeight = availableHeight / size.height
    const scale =
      state.zoomMode === 'fit-width' ? scaleWidth : Math.min(scaleWidth, scaleHeight)
    const clamped = Math.min(4, Math.max(0.15, scale))
    if (Math.abs(clamped - lastFitRef.current) < 0.004) return
    lastFitRef.current = clamped
    setZoom(clamped, state.zoomMode)
  }, [state.file, state.zoomMode, containerSize, sizes, setZoom])

  // --- Ctrl + wheel zoom ----------------------------------------------------
  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      lastFitRef.current = -1
      zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12)
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [zoomBy])

  // --- Scroll handling ------------------------------------------------------
  const handleScroll = (): void => {
    const container = scrollRef.current
    if (!container) return
    const probe = container.scrollTop + 80
    let current = 1
    for (const [pageNumber, element] of pagesRef.current) {
      if (element.offsetTop - container.offsetTop <= probe) current = pageNumber
      else break
    }
    if (current !== state.page) {
      programmaticRef.current = true
      setPage(current)
    }
  }

  // --- Scroll to the active page -------------------------------------------
  useEffect(() => {
    if (programmaticRef.current) {
      programmaticRef.current = false
      return
    }
    const container = scrollRef.current
    const element = pagesRef.current.get(state.page)
    if (!container || !element) return
    const target = element.offsetTop - container.offsetTop - 12
    if (Math.abs(container.scrollTop - target) < 8) return
    container.scrollTo({ top: target, behavior: 'smooth' })
  }, [state.page])

  const activeHit =
    state.hitIndex >= 0 && state.hits[state.hitIndex] ? state.hits[state.hitIndex] : null
  const activeHitKey = activeHit ? `${activeHit.page}:${activeHit.start}` : null

  const hitsByPage = useMemo(() => {
    const map = new Map<number, typeof state.hits>()
    for (const hit of state.hits) {
      const list = map.get(hit.page) ?? []
      list.push(hit)
      map.set(hit.page, list)
    }
    return map
  }, [state.hits])

  return (
    <div className="pagearea">
      <SearchBar />
      <div className="pagearea__scroll" ref={scrollRef} onScroll={handleScroll}>
        <div className="pagearea__pages">
          {pages.map((pageNumber) => {
            const size = sizes.get(pageNumber) ?? DEFAULT_SIZE
            return (
              <PageSlot
                key={pageNumber}
                pageNumber={pageNumber}
                size={size}
                zoom={state.zoom}
                root={scrollRef.current}
                hits={hitsByPage.get(pageNumber) ?? []}
                activeHitKey={activeHitKey}
                signatureImage={signatureImage}
                onCreateAnnotation={addAnnotation}
                onRequestNote={onRequestNote}
                onPlaceSignature={onPlaceSignature}
                onVisible={(page) => {
                  if (page !== state.page) {
                    programmaticRef.current = true
                    setPage(page)
                  }
                }}
                registerElement={(page, element) => {
                  if (element) pagesRef.current.set(page, element)
                  else pagesRef.current.delete(page)
                }}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
