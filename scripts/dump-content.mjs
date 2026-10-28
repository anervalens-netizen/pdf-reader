import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
const buf = readFileSync('samples/pdf-annotated.pdf')
const text = buf.toString('latin1')
let index = 0
let n = 0
while (index < text.length) {
  const start = text.indexOf('stream', index)
  if (start === -1) break
  const dataStart = text.indexOf('\n', start) + 1
  const end = text.indexOf('endstream', dataStart)
  if (end === -1) break
  const raw = buf.subarray(dataStart, end)
  let content = null
  try { content = inflateSync(raw).toString('latin1') } catch { content = raw.toString('latin1') }
  if (/ re| Td| Tj/.test(content)) {
    n += 1
    console.log(`--- stream ${n} (${content.length} bytes) ---`)
    console.log(content.slice(0, 2200).replace(/\n/g, ' | '))
  }
  index = end + 9
}
