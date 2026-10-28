import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import {
  parsePageRange, rotatePdfPage, extractPdfPages, mergePdfDocuments, splitPdfAt
} from '../src/renderer/src/lib/pageTools.ts'

const original = await PDFDocument.create()
for (let n=0; n<4; n++) {
  const page = original.addPage([300 + n * 10, 450])
  page.drawText('Page ' + (n + 1), { x: 32, y: 380 })
}
const bytes = await original.save()
const source = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
const sourceCopy = Buffer.from(source)

assert.deepEqual(parsePageRange('1-3, 3,4', 4), [1,2,3,4])
assert.deepEqual(parsePageRange(' 2 ', 4), [2])
for (const range of ['', '0', '5', '3-2', '1-x', '2, 7']) {
  assert.throws(() => parsePageRange(range, 4), Error)
}

const rotated = await rotatePdfPage(source, 2)
const afterRotation = await PDFDocument.load(rotated)
assert.equal(afterRotation.getPage(1).getRotation().angle, 90)
assert.equal(afterRotation.getPage(0).getRotation().angle, 0)
assert.equal((await PDFDocument.load(source)).getPage(1).getRotation().angle, 0)

const extracted = await extractPdfPages(source, [2,4])
const afterExtract = await PDFDocument.load(extracted)
assert.equal(afterExtract.getPageCount(), 2)
assert.equal(afterExtract.getPage(0).getWidth(), 310)
assert.equal(afterExtract.getPage(1).getWidth(), 330)

const secondary = await PDFDocument.create()
secondary.addPage([850,500])
const extra = await secondary.save()
const merged = await mergePdfDocuments([source, extra.buffer.slice(extra.byteOffset, extra.byteOffset+extra.byteLength)])
const afterMerge = await PDFDocument.load(merged)
assert.equal(afterMerge.getPageCount(), 5)
assert.equal(afterMerge.getPage(4).getWidth(), 850)

const [left,right] = await splitPdfAt(source,2)
assert.equal((await PDFDocument.load(left)).getPageCount(),2)
assert.equal((await PDFDocument.load(right)).getPageCount(),2)
assert.equal((await PDFDocument.load(right)).getPage(0).getWidth(),320)
await assert.rejects(() => splitPdfAt(source,4))
await assert.rejects(() => rotatePdfPage(source,0))
await assert.rejects(() => extractPdfPages(source,[8]))
await assert.rejects(() => mergePdfDocuments([source]))
await assert.rejects(() => rotatePdfPage(new ArrayBuffer(4),1))
assert.ok(Buffer.from(source).equals(sourceCopy), 'Source data was mutated')
console.log('OK — rotate, extract, merge, split, ranges, invalid inputs and original immutability')
