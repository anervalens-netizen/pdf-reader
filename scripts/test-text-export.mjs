import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PDFDocument } from 'pdf-lib'
import { exportAnnotatedPdf } from '../src/renderer/src/lib/annotations.ts'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const original = await PDFDocument.create()
original.addPage([600, 800])
const bytes = await original.save()
const input = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
const font = new Uint8Array(readFileSync('node_modules/@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf'))
const texts = ['România cu diacritice ăâîșț', 'Text pe un document PDF']
const annotations = texts.map((text, i) => ({
  id: 'text-' + i,
  type: 'text',
  page: 0,
  color: '#212529',
  opacity: 1,
  createdAt: Date.now(),
  rect: [50, 700 - i * 80, 520, 760 - i * 80],
  text,
  fontSize: 18
}))
const result = await exportAnnotatedPdf(input, annotations, { unicodeFontBytes: font })
assert.equal(result.warnings.length, 0, result.warnings.join('; '))
const outputSize = result.data.byteLength
const pdf = await getDocument({ data: new Uint8Array(result.data), useSystemFonts: true }).promise
assert.equal(pdf.numPages, 1)
const page = await pdf.getPage(1)
const content = (await page.getTextContent()).items.map((item) => ('str' in item ? item.str : '')).join(' ')
assert.ok(content.includes('România'), 'Unicode text must be extractable')
assert.ok(content.includes('ăâîșț'), 'Diacritics must survive PDF export')
assert.ok(content.includes('Text pe un document PDF'), 'ASCII text must survive')
assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1, 'Original remains unmodified')
console.log('Editable text export ASCII/Unicode: OK', outputSize, 'bytes')

// Unsupported glyphs must never be silently substituted with empty boxes.
const unsafeText = [{ ...annotations[0], id: 'unsupported', text: 'CJK 汉字 and emoji 😀' }]
const unsafe = await exportAnnotatedPdf(input, unsafeText, { unicodeFontBytes: font })
assert.ok(unsafe.warnings.some(w => w.includes('caractere neacoperite')),
  'Missing-glyph warning is required before exporting unsupported text')
const unsafePages = await PDFDocument.load(unsafe.data)
assert.equal(unsafePages.getPageCount(), 1)
console.log('Unsupported Unicode glyphs explicitly warned: OK')
