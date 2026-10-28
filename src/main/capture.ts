import { mkdir, writeFile } from 'node:fs/promises'
import { authorizePdfPath } from './pdfAccess'
import { app, type BrowserWindow } from 'electron'

/**
 * Development helper: renders the app and writes PNG captures to disk.
 * Active only when PDF_CAPTURE_DIR is set — never used in production.
 */
export async function runCaptureSequence(
  win: BrowserWindow,
  samplePdf: string
): Promise<void> {
  const dir = process.env.PDF_CAPTURE_DIR
  if (!dir) return

  await mkdir(dir, { recursive: true })

  const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

  win.webContents.on('console-message', (event) => {
    const level = typeof event === 'object' && 'level' in event ? event.level : 'info'
    console.log(`[renderer:${level}] ${event.message ?? ''}`)
  })

  const capture = async (name: string): Promise<void> => {
    const image = await win.webContents.capturePage()
    const file = `${dir}/${name}.png`
    await writeFile(file, image.toPNG())
    console.log(`[capture] ${file}`)
  }

  const run = async (script: string): Promise<void> => {
    try {
      const result = await win.webContents.executeJavaScript(script, true)
      console.log(`[script] ${String(result)}`)
    } catch (error) {
      console.warn('[script] failed', error)
    }
  }

  await wait(2200)
  await capture('01-welcome')

  authorizePdfPath(samplePdf)
  win.webContents.send('pdf:file-opened', { path: samplePdf, name: 'pdf-sample.pdf' })

  // Wait until the text layer is really in place before interacting with it.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await wait(500)
    const ready = await win.webContents
      .executeJavaScript("document.querySelectorAll('.textLayer span').length", true)
      .catch(() => 0)
    if (typeof ready === 'number' && ready > 0) break
  }

  await wait(1200)
  await capture('02-reading-light')

  await run(`(() => {
    const layer = document.querySelector('.textLayer');
    const spans = document.querySelectorAll('.textLayer span');
    return 'textLayer=' + (layer ? 'yes' : 'no') + ' spans=' + spans.length + ' html=' + (layer ? layer.innerHTML.length : -1) + ' w=' + (layer ? layer.getBoundingClientRect().width : -1);
  })()`)

  // Highlight the first words of the page by simulating a text selection.
  await run(`(() => {
    const tool = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Evidențiere');
    if (!tool) return 'no highlight tool';
    tool.click();
    return 'highlight tool selected';
  })()`)
  await wait(600)
  await run(`(() => {
    const spans = [...document.querySelectorAll('.textLayer span')].filter(s => s.firstChild && s.textContent.trim().length > 4);
    if (spans.length < 2) return 'no text spans (' + spans.length + ')';
    const range = document.createRange();
    range.setStart(spans[0].firstChild, 0);
    const end = spans[1].firstChild;
    range.setEnd(end, Math.min(10, end.textContent.length));
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const page = document.querySelector('.page');
    page.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    return 'selection dispatched over ' + spans.length + ' spans';
  })()`)
  await wait(1200)
  await capture('03-highlight')

  // Open the search panel and look for a term.
  await run(`(() => {
    const button = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Caută');
    if (!button) return 'no search button';
    button.click();
    return 'search opened';
  })()`)
  await wait(400)
  await run(`(() => {
    const input = document.querySelector('.searchbar__input');
    if (!input) return 'no search input';
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'PDF');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return 'query set';
  })()`)
  await wait(2500)
  await capture('04-search')

  // Dark theme.
  win.webContents.send('pdf:menu-action', 'toggle-theme')
  await wait(400)
  win.webContents.send('pdf:menu-action', 'toggle-theme')
  await wait(1200)
  await capture('05-reading-dark')

  // The exported document, with the annotations baked in.
  const annotated = process.env.PDF_CAPTURE_ANNOTATED
  if (annotated) {
    win.webContents.send('pdf:menu-action', 'toggle-theme')
    await wait(300)
    win.webContents.send('pdf:menu-action', 'toggle-theme')
    await wait(600)
    authorizePdfPath(annotated)
    win.webContents.send('pdf:file-opened', { path: annotated, name: 'pdf-annotated.pdf' })
    await wait(3200)
    await run(`(() => JSON.stringify({
      hits: document.querySelectorAll('.overlay-hit').length,
      highlights: document.querySelectorAll('.overlay-highlight').length,
      notes: document.querySelectorAll('.overlay-note').length,
      searchOpen: !!document.querySelector('.searchbar'),
      selection: window.getSelection().toString().slice(0, 40)
    }))()`)
    await capture('06-exported-pdf')
  }

  console.log('[capture] done')

  // Round-trip check for the file writing IPC path.
  if (process.env.PDF_CAPTURE_WRITE_TEST) {
    const target = process.env.PDF_CAPTURE_WRITE_TEST
    const result = await win.webContents.executeJavaScript(
      `(async () => {
         const file = await window.pdf.readFile(${JSON.stringify(samplePdf)});
         if (!file) return 'read failed';
         const saved = await window.pdf.saveTo(${JSON.stringify(target)}, file.data);
         return JSON.stringify(saved);
       })()`,
      true
    )
    console.log(`[capture] saveTo -> ${String(result)}`)
  }

  // A renderer must not read a valid PDF that the user never selected.
  if (process.env.PDF_CAPTURE_DENIED_PDF) {
    const candidate = process.env.PDF_CAPTURE_DENIED_PDF
    const denied = await win.webContents.executeJavaScript(
      `window.pdf.readFile(${JSON.stringify(candidate)}).then(file => file === null)`,
      true
    )
    if (!denied) throw new Error('SECURITY FAILURE: unauthorized PDF was readable')
    console.log('[capture] unauthorized PDF read refused')
  }

  app.exit(0)
}
