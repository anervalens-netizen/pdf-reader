/**
 * End-to-end check of the annotation export pipeline.
 *
 * Builds a set of annotations, exports them into a copy of the sample PDF and
 * verifies that the result is a valid, still-readable document.
 *
 * Run: node scripts/test-export.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFDocument } from 'pdf-lib'
import { deflateSync } from 'node:zlib'
import { exportAnnotatedPdf } from '../src/renderer/src/lib/annotations.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const samplePath = resolve(root, 'samples/pdf-sample.pdf')
const outputPath = resolve(root, 'samples/pdf-annotated.pdf')

/* --- Minimal PNG encoder (transparent background, dark stroke) ------------ */
function crc32(buffer) {
  let crc = ~0
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i]
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return ~crc >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData), 0)
  return Buffer.concat([length, typeAndData, crc])
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/** Draws a simple cursive-looking signature stroke. */
function signaturePng() {
  const width = 260
  const height = 80
  const rgba = Buffer.alloc(width * height * 4)
  const stroke = (x0, y0, x1, y1) => {
    const steps = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0)))
    for (let i = 0; i <= steps; i += 1) {
      const x = Math.round(x0 + ((x1 - x0) * i) / steps)
      const y = Math.round(y0 + ((y1 - y0) * i) / steps)
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const px = x + dx
          const py = y + dy
          if (px < 0 || py < 0 || px >= width || py >= height) continue
          const offset = (py * width + px) * 4
          rgba[offset] = 35
          rgba[offset + 1] = 32
          rgba[offset + 2] = 28
          rgba[offset + 3] = 255
        }
      }
    }
  }
  stroke(12, 52, 60, 18)
  stroke(60, 18, 108, 56)
  stroke(108, 56, 156, 22)
  stroke(156, 22, 208, 50)
  stroke(208, 50, 246, 30)
  return `data:image/png;base64,${encodePng(width, height, rgba).toString('base64')}`
}

/* --- Test ---------------------------------------------------------------- */
const original = readFileSync(samplePath)
const originalBuffer = original.buffer.slice(
  original.byteOffset,
  original.byteOffset + original.byteLength
)

const annotations = [
  {
    id: 'a1',
    type: 'highlight',
    page: 0,
    color: '#ffd94a',
    opacity: 0.38,
    createdAt: Date.now(),
    quads: [[72, 700, 420, 700, 72, 686, 420, 686]],
    text: 'sample'
  },
  {
    id: 'a2',
    type: 'underline',
    page: 0,
    color: '#e03131',
    opacity: 1,
    createdAt: Date.now(),
    quads: [[72, 660, 500, 660, 72, 648, 500, 648]]
  },
  {
    id: 'a3',
    type: 'note',
    page: 0,
    color: '#b4532a',
    opacity: 0.92,
    createdAt: Date.now(),
    rect: [500, 700, 522, 722],
    comment: 'De verificat'
  },
  {
    id: 'a4',
    type: 'ink',
    page: 0,
    color: '#1971c2',
    opacity: 1,
    createdAt: Date.now(),
    paths: [[100, 600, 140, 630, 180, 590, 220, 625]],
    width: 1.6
  },
  {
    id: 'a5',
    type: 'signature',
    page: 0,
    color: '#23221f',
    opacity: 1,
    createdAt: Date.now(),
    rect: [72, 520, 222, 572],
    image: signaturePng()
  }
]

const result = await exportAnnotatedPdf(originalBuffer, annotations, {
  formValues: [{ name: 'missing', type: 'text', value: 'ignored' }]
})

const failures = []
if (result.warnings.length) failures.push(`warnings: ${result.warnings.join(' | ')}`)
if (result.data.byteLength <= original.length) failures.push('exported file is not larger than the original')

const reloaded = await PDFDocument.load(result.data, { updateMetadata: false })
if (reloaded.getPageCount() !== 12) failures.push(`page count changed: ${reloaded.getPageCount()}`)

// Round-trip: the exported file must be re-loadable and re-savable.
const resaved = await reloaded.save()
if (resaved.length === 0) failures.push('round-trip save produced an empty file')

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, Buffer.from(result.data))

console.log(`original : ${original.length} bytes`)
console.log(`exported : ${result.data.byteLength} bytes`)
console.log(`pages    : ${reloaded.getPageCount()}`)
console.log(`written  : ${outputPath}`)

if (failures.length) {
  console.error(`FAILED: ${failures.join('; ')}`)
  process.exit(1)
}
console.log('OK — export pipeline verified')
