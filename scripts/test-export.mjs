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
import { PDFDocument, PDFDict, PDFHexString, PDFName, PDFRawStream } from 'pdf-lib'
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
    comment: 'De verificat în întregime: documentul conține informații importante, șir lung cu diacritice ăâîșț.'
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

const result = await exportAnnotatedPdf(originalBuffer, annotations)

const failures = []
if (result.warnings.length) failures.push(`warnings: ${result.warnings.join(' | ')}`)
if (result.data.byteLength <= original.length) failures.push('exported file is not larger than the original')

const reloaded = await PDFDocument.load(result.data, { updateMetadata: false })
if (reloaded.getPageCount() !== 12) failures.push(`page count changed: ${reloaded.getPageCount()}`)

// Full Unicode sticky-note content must survive a PDF roundtrip.
const pageAnnotations = reloaded.getPage(0).node.Annots()
const noteContents = []
if (pageAnnotations) {
  for (let index = 0; index < pageAnnotations.size(); index++) {
    const dict = reloaded.context.lookup(pageAnnotations.get(index), PDFDict)
    const text = dict.get(PDFName.of('Contents'))
    if (text instanceof PDFHexString) noteContents.push(text.decodeText())
  }
}
if (!noteContents.some((text) => text.includes('ăâîșț'))) failures.push('Unicode note comment was lost')

// Real AcroForm field types returned by PDF.js must map to writable pdf-lib
// fields; merely generating a PDF is not proof that filled values survive.
const formDoc = await PDFDocument.create()
const formPage = formDoc.addPage([595, 842])
const form = formDoc.getForm()
const textField = form.createTextField('client')
textField.addToPage(formPage, { x: 50, y: 700, width: 200, height: 24 })
const checkbox = form.createCheckBox('approved')
checkbox.addToPage(formPage, { x: 50, y: 660, width: 24, height: 24 })
const radio = form.createRadioGroup('choice')
radio.addOptionToPage('A', formPage, { x: 50, y: 620, width: 24, height: 24 })
radio.addOptionToPage('B', formPage, { x: 100, y: 620, width: 24, height: 24 })
const dropdown = form.createDropdown('category')
dropdown.addOptions(['Public', 'Private'])
dropdown.addToPage(formPage, { x: 50, y: 580, width: 200, height: 24 })
const originalForm = await formDoc.save()
const formExport = await exportAnnotatedPdf(originalForm.buffer.slice(originalForm.byteOffset, originalForm.byteOffset + originalForm.byteLength), [], {
  formValues: [
    { name: 'client', type: 'Tx', value: 'Exemplu' },
    { name: 'approved', type: 'Btn', value: true },
    { name: 'choice', type: 'Btn', value: 'B' },
    { name: 'category', type: 'Ch', value: 'Private' }
  ]
})
if (formExport.warnings.length) failures.push('form warnings: ' + formExport.warnings.join(' | '))
const savedForm = (await PDFDocument.load(formExport.data)).getForm()
if (savedForm.getTextField('client').getText() !== 'Exemplu') failures.push('text field lost')
if (!savedForm.getCheckBox('approved').isChecked()) failures.push('checkbox lost')
if (savedForm.getRadioGroup('choice').getSelected() !== 'B') failures.push('radio selection lost')
if (savedForm.getDropdown('category').getSelected()[0] !== 'Private') failures.push('dropdown selection lost')

// Unicode output must contain an actual embedded font in widget appearance,
// not merely store correct /V with NeedAppearances.
const unicodeBytes = readFileSync(resolve(root, 'node_modules/@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf'))
const unicodeForm = await exportAnnotatedPdf(originalForm.buffer.slice(originalForm.byteOffset, originalForm.byteOffset + originalForm.byteLength), [], {
  formValues: [{ name: 'client', type: 'Tx', value: 'Ștefan Țucă ăâîșț' }],
  unicodeFontBytes: unicodeBytes
})
if (unicodeForm.warnings.length) failures.push('Unicode form warnings: ' + unicodeForm.warnings.join(' | '))
const loadedUnicode = await PDFDocument.load(unicodeForm.data)
const unicodeField = loadedUnicode.getForm().getTextField('client')
if (unicodeField.getText() !== 'Ștefan Țucă ăâîșț') failures.push('Unicode form field lost')
const unicodeAppearance = unicodeField.acroField.getWidgets()[0].getAppearances()?.normal
const appearanceStream = unicodeAppearance ? loadedUnicode.context.lookup(unicodeAppearance, PDFRawStream) : null
const resourceDict = appearanceStream?.dict.lookup(PDFName.of('Resources'), PDFDict)
const fontResources = resourceDict?.lookup(PDFName.of('Font'), PDFDict)
const embeddedFonts = fontResources?.entries().map(([,ref]) => loadedUnicode.context.lookup(ref, PDFDict)) ?? []
const hasUnicodeAppearance = embeddedFonts.some((font) => font.get(PDFName.of('Subtype'))?.toString() === '/Type0')
if (!hasUnicodeAppearance) failures.push('Unicode appearance lacks embedded Type0 font')
console.log('unicode form value + embedded Type0 appearance:', hasUnicodeAppearance)
// Preserve the fallback on systems without font bytes.
const noFontExport = await exportAnnotatedPdf(originalForm.buffer.slice(originalForm.byteOffset, originalForm.byteOffset + originalForm.byteLength), [], {
  formValues: [{ name: 'client', type: 'Tx', value: 'Ștefan Țucă' }]
})
if (!noFontExport.warnings.some((warning) => warning.includes('diacritice'))) failures.push('missing-font fallback warning absent')

// A Latin font does not contain CJK or emoji. Never produce fake glyphs with
// a false success toast: keep /V and tell the PDF reader to regenerate AP.
for (const unsupportedText of ['你好，世界', 'Salut 😀']) {
  const unsupported = await exportAnnotatedPdf(originalForm.buffer.slice(originalForm.byteOffset, originalForm.byteOffset + originalForm.byteLength), [], {
    formValues: [{ name: 'client', type: 'Tx', value: unsupportedText }],
    unicodeFontBytes: unicodeBytes
  })
  const unsupportedDoc = await PDFDocument.load(unsupported.data)
  if (unsupportedDoc.getForm().getTextField('client').getText() !== unsupportedText) failures.push('unsupported glyph field value was lost')
  if (!unsupported.warnings.some((message) => message.includes('nu acoperă'))) failures.push('unsupported glyph warning missing')
  const acroFormRef = unsupportedDoc.catalog.get(PDFName.of('AcroForm'))
  const acroForm = unsupportedDoc.context.lookup(acroFormRef, PDFDict)
  if (acroForm.get(PDFName.of('NeedAppearances'))?.toString() !== 'true') failures.push('unsupported glyph must request new field appearances')
}
console.log('unsupported CJK/emoji values preserved with warning and NeedAppearances')

// Newline characters are separators, not glyphs. A multiline Unicode text
// field must still get a regenerated appearance without unsupported warnings.
const multilineDoc = await PDFDocument.create()
const multilinePage = multilineDoc.addPage([595, 842])
const multiline = multilineDoc.getForm().createTextField('address')
multiline.enableMultiline()
multiline.addToPage(multilinePage, { x: 50, y: 600, width: 240, height: 80 })
const multilineOriginal = await multilineDoc.save()
const multilineText = 'café\nParis\r\nBucurești'
const multilineResult = await exportAnnotatedPdf(multilineOriginal.buffer.slice(multilineOriginal.byteOffset, multilineOriginal.byteOffset + multilineOriginal.byteLength), [], {
  formValues: [{ name: 'address', type: 'Tx', value: multilineText }],
  unicodeFontBytes: unicodeBytes
})
if (multilineResult.warnings.length) failures.push('multiline form unexpected warning: ' + multilineResult.warnings.join(' | '))
const multilineReloaded = await PDFDocument.load(multilineResult.data)
if (multilineReloaded.getForm().getTextField('address').getText() !== multilineText) failures.push('multiline form value lost')
const multilineAppearance = multilineReloaded.getForm().getTextField('address').acroField.getWidgets()[0].getAppearances()?.normal
const multilineStream = multilineAppearance ? multilineReloaded.context.lookup(multilineAppearance, PDFRawStream) : null
const multilineFonts = multilineStream?.dict.lookup(PDFName.of('Resources'), PDFDict)?.lookup(PDFName.of('Font'), PDFDict)
if (!multilineFonts?.entries().some(([,ref]) => multilineReloaded.context.lookup(ref, PDFDict).get(PDFName.of('Subtype'))?.toString() === '/Type0')) failures.push('multiline Unicode appearance missing')
console.log('multiline Unicode value + appearance preserved')

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
