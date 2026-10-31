import { PDFDocument } from 'pdf-lib'
import { AnnotationMode, type PDFDocumentProxy } from './pdf'
import type { Annotation } from './annotations'

export class PrintCancelledError extends Error {
  constructor() { super('Imprimarea a fost anulată deoarece documentul s-a schimbat.') }
}

function assertCurrent(signal: AbortSignal): void {
  if (signal.aborted) throw new PrintCancelledError()
}

async function drawOverlay(
  ctx: CanvasRenderingContext2D,
  viewport: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['getViewport']>,
  item: Annotation,
): Promise<void> {
  const point = (x: number, y: number): [number, number] => {
    const [px, py] = viewport.convertToViewportPoint(x, y)
    return [px, py]
  }
  const rectangle = (coords: [number, number, number, number]): [number, number, number, number] => {
    const a = point(coords[0], coords[1]), b = point(coords[2], coords[3])
    return [Math.min(a[0],b[0]), Math.min(a[1],b[1]), Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1])]
  }
  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, item.opacity))
  ctx.strokeStyle = item.color
  ctx.fillStyle = item.color
  if (item.type === 'highlight' || item.type === 'underline') {
    for (const quad of item.quads) {
      const points = [point(quad[0],quad[1]), point(quad[2],quad[3]),
        point(quad[4],quad[5]), point(quad[6],quad[7])]
      const xs=points.map(x=>x[0]), ys=points.map(x=>x[1])
      const left=Math.min(...xs), right=Math.max(...xs), top=Math.min(...ys),bottom=Math.max(...ys)
      if (item.type === 'highlight') {
        ctx.globalCompositeOperation='multiply'
        ctx.fillRect(left,top,right-left,bottom-top)
      } else {
        ctx.lineWidth = 1.6
        ctx.beginPath();ctx.moveTo(left,bottom);ctx.lineTo(right,bottom);ctx.stroke()
      }
    }
  } else if (item.type === 'ink') {
    ctx.lineWidth = Math.max(1, item.width * viewport.scale)
    ctx.lineCap = 'round'
    for (const path of item.paths) {
      if (path.length < 4) continue
      ctx.beginPath()
      for (let i=0; i<path.length; i+=2) {
        const [x,y]=point(path[i],path[i+1])
        if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y)
      }
      ctx.stroke()
    }
  } else if (item.type === 'note') {
    const [x,y,w,h]=rectangle(item.rect)
    ctx.fillRect(x,y,w,h)
  } else if (item.type === 'signature') {
    const image=new Image()
    image.src=item.image
    await image.decode()
    const [x,y,w,h]=rectangle(item.rect)
    ctx.drawImage(image,x,y,w,h)
  } else if (item.type === 'text') {
    const [x,y,w]=rectangle(item.rect)
    const size=Math.max(6,Math.min(72,item.fontSize))*viewport.scale
    ctx.textBaseline='top'
    ctx.font=size+'px Arial, sans-serif'
    let dy=0
    for (const rawLine of item.text.split('\n')) {
      // Raster fallback wraps into available textbox width.
      const words=rawLine.split(/\s+/)
      let line=''
      for (const word of words) {
        const next=line ? line+' '+word : word
        if (line && ctx.measureText(next).width > w) {
          ctx.fillText(line,x,y+dy)
          dy+=size*1.25
          line=word
        } else line=next
      }
      if(line) ctx.fillText(line,x,y+dy)
      dy+=size*1.25
    }
  }
  ctx.restore()
}

/**
 * PDF.js has already decrypted protected source using the user's password.
 * pdf-lib cannot load encrypted originals, so rasterize each visible page
 * independently, at print resolution, into a NEW non-encrypted PDF.
 * This never stores the password or touches the source.
 */
export async function printCopyOfProtectedPdf(
  document: PDFDocumentProxy,
  annotations: Annotation[],
  signal: AbortSignal,
): Promise<ArrayBuffer> {
  const result = await PDFDocument.create()
  for (let index = 0; index < document.numPages; index += 1) {
    assertCurrent(signal)
    const page = await document.getPage(index + 1)
    const viewAt1 = page.getViewport({ scale: 1 })
    // 2x == 144 dpi for 72 pt PDF units. Bound giant pages to 2500 px.
    const scale = Math.min(2, 2500 / Math.max(viewAt1.width, viewAt1.height))
    const viewport = page.getViewport({ scale })
    const canvas = window.document.createElement('canvas')
    canvas.width = Math.max(1,Math.ceil(viewport.width))
    canvas.height = Math.max(1,Math.ceil(viewport.height))
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Nu poate fi pregătită imprimarea paginii protejate.')
    try {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0,0,canvas.width,canvas.height)
      await page.render({
        canvas, canvasContext: ctx, viewport,
        // Print-specific OCG/annotation visibility differs from on-screen view.
        intent: 'print',
        annotationMode: AnnotationMode.ENABLE_STORAGE
      }).promise
      assertCurrent(signal)
      for (const item of annotations.filter(item => item.page === index)) {
        await drawOverlay(ctx,viewport,item)
        assertCurrent(signal)
      }
      const blob = await new Promise<Blob>((resolve,reject)=>{
        canvas.toBlob(value=>value?resolve(value):reject(new Error('Nu se poate rasteriza pagina.')),
          'image/jpeg',0.88)
      })
      assertCurrent(signal)
      const jpg=await result.embedJpg(await blob.arrayBuffer())
      const target=result.addPage([viewAt1.width,viewAt1.height])
      target.drawImage(jpg,{x:0,y:0,width:viewAt1.width,height:viewAt1.height})
      // Give the PDF.js renderer room to release the completed page.
      page.cleanup()
    } finally {
      canvas.width=0
      canvas.height=0
    }
  }
  assertCurrent(signal)
  const bytes = await result.save()
  assertCurrent(signal)
  return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer
}
