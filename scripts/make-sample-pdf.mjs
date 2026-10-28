/**
 * Creates a multi-page sample PDF used for manual testing and QA captures.
 * Run: node scripts/make-sample-pdf.mjs [outputPath]
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(root, process.argv[2] ?? 'samples/pdf-sample.pdf')

const PARAGRAPHS = [
  'PDF is a PDF reader built for calm reading, without distractions. The text stays legible, the tools stay compact, and everything happens immediately.',
  'The document you are reading can be searched, highlighted, underlined, annotated and even signed. Every annotation can be exported into a new copy of the file.',
  'Navigation is fluid: pages load as you reach them, and the side panel gives you an overview of the whole document.',
  'Each document keeps a reading session, so you always find it exactly where you left it.'
]

const pdfDoc = await PDFDocument.create()
const bodyFont = await pdfDoc.embedFont(StandardFonts.TimesRoman)
const boldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold)
const sansFont = await pdfDoc.embedFont(StandardFonts.Helvetica)

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 72

for (let pageIndex = 0; pageIndex < 12; pageIndex += 1) {
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  const number = pageIndex + 1

  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - 6,
    width: PAGE_WIDTH,
    height: 6,
    color: rgb(0.71, 0.33, 0.16)
  })

  page.drawText(`Chapter ${number}`, {
    x: MARGIN,
    y: PAGE_HEIGHT - 120,
    size: 26,
    font: boldFont,
    color: rgb(0.14, 0.13, 0.12)
  })

  page.drawText('PDF - sample document', {
    x: MARGIN,
    y: PAGE_HEIGHT - 148,
    size: 12,
    font: sansFont,
    color: rgb(0.45, 0.43, 0.4)
  })

  let y = PAGE_HEIGHT - 196
  for (let index = 0; index < PARAGRAPHS.length; index += 1) {
    const text = `${number}.${index + 1} ${PARAGRAPHS[index % PARAGRAPHS.length]}`
    const words = text.split(' ')
    let line = ''
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (bodyFont.widthOfTextAtSize(candidate, 11.5) > PAGE_WIDTH - MARGIN * 2) {
        page.drawText(line, { x: MARGIN, y, size: 11.5, font: bodyFont, color: rgb(0.16, 0.15, 0.14) })
        y -= 18
        line = word
      } else {
        line = candidate
      }
    }
    if (line) {
      page.drawText(line, { x: MARGIN, y, size: 11.5, font: bodyFont, color: rgb(0.16, 0.15, 0.14) })
      y -= 18
    }
    y -= 12
  }

  page.drawText('Search for this word: PDF', {
    x: MARGIN,
    y: 150,
    size: 13,
    font: sansFont,
    color: rgb(0.71, 0.33, 0.16)
  })

  page.drawLine({
    start: { x: MARGIN, y: 132 },
    end: { x: PAGE_WIDTH - MARGIN, y: 132 },
    thickness: 0.8,
    color: rgb(0.82, 0.8, 0.77)
  })

  page.drawText(`${number}`, {
    x: PAGE_WIDTH / 2 - 6,
    y: 54,
    size: 10,
    font: sansFont,
    color: rgb(0.55, 0.53, 0.5)
  })
}

const bytes = await pdfDoc.save()
mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, bytes)
console.log(`wrote ${output} (${bytes.length} bytes, 12 pages)`)
