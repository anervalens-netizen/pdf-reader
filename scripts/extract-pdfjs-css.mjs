/**
 * Extracts the `.textLayer` and `.annotationLayer` rule blocks from the
 * installed pdfjs-dist stylesheet into a self-contained stylesheet.
 *
 * Run: node scripts/extract-pdfjs-css.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, 'node_modules/pdfjs-dist/web/pdf_viewer.css')
const target = resolve(root, 'src/renderer/src/styles/pdfjs.css')

const css = readFileSync(source, 'utf-8')

function extractBlock(selector) {
  const start = css.indexOf(`${selector} {`)
  if (start === -1) throw new Error(`selector not found: ${selector}`)
  let depth = 0
  let index = css.indexOf('{', start)
  const open = index
  for (; index < css.length; index += 1) {
    const char = css[index]
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        return css.slice(start, index + 1)
      }
    }
  }
  throw new Error(`unbalanced block: ${selector}`)
  void open
}

const blocks = [extractBlock('.textLayer'), extractBlock('.annotationLayer')]

const header = `/* Extracted from pdfjs-dist/web/pdf_viewer.css — do not edit by hand.
   Regenerate with: node scripts/extract-pdfjs-css.mjs */\n\n`

const footer = `

/* --- PDF overrides -------------------------------------------------- */
.page {
  --total-scale-factor: 1;
  --scale-round-x: 1px;
  --scale-round-y: 1px;
}

.textLayer {
  z-index: 2;
}

.textLayer ::selection {
  background: rgba(102, 163, 255, 0.38);
}

.annotationLayer {
  z-index: 3;
}
`

mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, header + blocks.join('\n\n') + footer, 'utf-8')

console.log(`wrote ${target} (${blocks.join('\n\n').length} bytes of rules)`)
