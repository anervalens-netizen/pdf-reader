import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { Icon } from './Icon'

interface SignatureDialogProps {
  open: boolean
  onCancel: () => void
  onConfirm: (dataUrl: string) => void
}

/** Draw a signature with the mouse, pen or touch, then place it on the page. */
export function SignatureDialog({ open, onCancel, onConfirm }: SignatureDialogProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawingRef = useRef(false)
  const lastRef = useRef<{ x: number; y: number } | null>(null)
  const [hasInk, setHasInk] = useState(false)

  const clear = useCallback(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
  }, [])

  useEffect(() => {
    if (open) {
      setHasInk(false)
      window.setTimeout(clear, 0)
    }
  }, [open, clear])

  const pointerPosition = (event: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const canvas = canvasRef.current!
    const bounds = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * canvas.width,
      y: ((event.clientY - bounds.top) / bounds.height) * canvas.height
    }
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drawingRef.current = true
    lastRef.current = pointerPosition(event)
    context.beginPath()
    context.moveTo(lastRef.current.x, lastRef.current.y)
    context.stroke()
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!drawingRef.current) return
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const point = pointerPosition(event)
    const last = lastRef.current
    if (!last) return
    context.beginPath()
    context.moveTo(last.x, last.y)
    context.lineTo(point.x, point.y)
    context.stroke()
    lastRef.current = point
    if (!hasInk) setHasInk(true)
  }

  const handlePointerUp = (): void => {
    drawingRef.current = false
    lastRef.current = null
  }

  const confirm = (): void => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return

    // Trim transparent margins so the signature sits tight on the page.
    const { width, height } = canvas
    const data = context.getImageData(0, 0, width, height).data
    let minX = width
    let minY = height
    let maxX = 0
    let maxY = 0
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (data[(y * width + x) * 4 + 3] > 8) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
    if (maxX < minX || maxY < minY) return

    const padding = 8
    const x = Math.max(0, minX - padding)
    const y = Math.max(0, minY - padding)
    const widthOut = Math.min(width - x, maxX - minX + padding * 2)
    const heightOut = Math.min(height - y, maxY - minY + padding * 2)

    const trimmed = document.createElement('canvas')
    trimmed.width = widthOut
    trimmed.height = heightOut
    const trimmedContext = trimmed.getContext('2d')
    if (!trimmedContext) return
    trimmedContext.drawImage(canvas, x, y, widthOut, heightOut, 0, 0, widthOut, heightOut)
    onConfirm(trimmed.toDataURL('image/png'))
  }

  if (!open) return <></>

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Semnătură">
      <div className="modal">
        <header className="modal__header">
          <h2 className="modal__title">Adaugă o semnătură</h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="Închide"
            onClick={onCancel}
          >
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="modal__body">
          <p className="modal__hint">
            Semnează cu mouse-ul, stylus-ul sau degetul. Poți șterge și redesena.
          </p>
          <canvas
            ref={canvasRef}
            className="signature-canvas"
            width={640}
            height={220}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          />
          {!hasInk && <span className="signature-canvas__hint">Semnează aici…</span>}
        </div>

        <footer className="modal__footer">
          <button type="button" className="btn" onClick={clear} disabled={!hasInk}>
            Șterge
          </button>
          <div className="modal__footer-spacer" />
          <button type="button" className="btn" onClick={onCancel}>
            Renunță
          </button>
          <button type="button" className="btn btn--primary" onClick={confirm} disabled={!hasInk}>
            Folosește semnătura
          </button>
        </footer>
      </div>
    </div>
  )
}
