/**
 * End-to-end QA for the web / PWA build.
 *
 * Serves `dist-web` over http://localhost and drives the application in a
 * plain Chromium window - no preload, so the renderer uses the browser
 * implementation of the `PdfApi` contract, exactly like on Android.
 *
 * The PDF is delivered through a synthetic drop event, the same path a user
 * takes when dragging a file onto the window. The script then checks that the
 * document really rendered and writes a screenshot.
 *
 * Run: npx electron scripts/qa-web.cjs
 */
const { app, BrowserWindow } = require('electron')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const { PDFDocument } = require('pdf-lib')

const root = path.resolve(__dirname, '..')
const dist = path.join(root, 'dist-web')
const sample = path.join(root, 'samples', 'pdf-sample.pdf')
const outDir = path.join(root, 'qa-web')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.bcmap': 'application/octet-stream',
  '.pfb': 'application/octet-stream',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm'
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function startServer() {
  const server = http.createServer((request, response) => {
    const url = (request.url ?? '/').split('?')[0]

    if (url === '/sample.pdf') {
      response.setHeader('Content-Type', 'application/pdf')
      response.end(fs.readFileSync(sample))
      return
    }

    const relative = url === '/' ? 'index.html' : url.replace(/^\/+/, '')
    const file = path.join(dist, relative)

    if (!file.startsWith(dist) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.statusCode = 404
      response.end('not found')
      return
    }

    response.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream')
    response.end(fs.readFileSync(file))
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }))
  })
}

async function main() {
  if (!fs.existsSync(dist)) {
    console.error('[qa-web] dist-web lipsește - rulează mai întâi: npm run build:web')
    app.exit(1)
    return
  }
  if (!fs.existsSync(sample)) {
    console.error('[qa-web] samples/pdf-sample.pdf lipsește - rulează: node scripts/make-sample-pdf.mjs')
    app.exit(1)
    return
  }

  const { server, port } = await startServer()
  fs.mkdirSync(outDir, { recursive: true })

  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    show: true,
    frame: false,
    backgroundColor: '#F7F5F2'
  })
  win.setPosition(0, 0) // Must be on-screen for IntersectionObserver on hosted CI.

  await win.loadURL(`http://127.0.0.1:${port}/`)
  await delay(1200)

  // Simulate v1.0.0 stored PDF and annotations to verify migration without
  // touching or deleting the original records.
  await win.webContents.executeJavaScript(`(async () => {
    const pdf = await (await fetch('/sample.pdf')).arrayBuffer()
    const open = (name, version) => new Promise((resolve, reject) => {
      const req = indexedDB.open(name, version)
      req.onupgradeneeded = () => {
        const db = req.result
        if (name === 'pdf-web-files' && !db.objectStoreNames.contains('files')) db.createObjectStore('files', {keyPath:'path'})
        if (name === 'pdf') {
          for (const store of ['recents','sessions','annotations']) {
            if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, {keyPath:'path'})
          }
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const txWrite = (db, storeName, record) => new Promise((resolve,reject) => {
      const tx = db.transaction(storeName, 'readwrite')
      tx.objectStore(storeName).put(record)
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
    const files = await open('pdf-web-files', 1)
    await txWrite(files, 'files', {path:'web:pdf-sample.pdf',name:'pdf-sample.pdf',size:pdf.byteLength,data:pdf})
    files.close()
    const meta = await open('pdf',1)
    await txWrite(meta, 'annotations', {path:'web:pdf-sample.pdf',updatedAt:1,annotations:[{
      id:'legacy-test-note',type:'note',page:0,rect:[40,500,65,525],
      color:'#b4532a',opacity:1,createdAt:1,comment:'legacy preserved'
    }]})
    await txWrite(meta,'sessions',{path:'web:pdf-sample.pdf',page:4,zoom:1,zoomMode:'custom',scrollTop:0,updatedAt:1})
    meta.close()
  })()`, true)

  // Exactly what a user does when dropping a PDF onto the window.
  const dropResult = await win.webContents.executeJavaScript(
    `(async () => {
      const response = await fetch('/sample.pdf')
      const buffer = await response.arrayBuffer()
      const file = new File([buffer], 'pdf-sample.pdf', { type: 'application/pdf' })
      const transfer = new DataTransfer()
      transfer.items.add(file)
      const event = new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true })
      window.dispatchEvent(event)
      return { bytes: buffer.byteLength }
    })()`,
    true
  )
  console.log(`[qa-web] document livrat prin drop: ${dropResult.bytes} bytes`)
  await delay(600)
  const legacyMigration = await win.webContents.executeJavaScript(`(async () => {
    const dataDb = await new Promise((resolve,reject) => {
      const req = indexedDB.open('pdf-web-files')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const newKey = await new Promise((resolve,reject) => {
      const req = dataDb.transaction('files').objectStore('files').getAllKeys()
      req.onsuccess = () => resolve(req.result.find(k => k.startsWith('web:sha256:')))
      req.onerror = () => reject(req.error)
    })
    dataDb.close()
    const db = await new Promise((resolve,reject) => {
      const req = indexedDB.open('pdf')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const read = (storeName,key) => new Promise((resolve,reject) => {
      const req=db.transaction(storeName).objectStore(storeName).get(key)
      req.onsuccess=()=>resolve(req.result)
      req.onerror=()=>reject(req.error)
    })
    const notes=await read('annotations',newKey)
    const session=await read('sessions',newKey)
    const original=await read('annotations','web:pdf-sample.pdf')
    db.close()
    return Boolean(notes?.annotations?.[0]?.comment === 'legacy preserved' &&
      session?.page===4 && original?.annotations?.[0]?.comment === 'legacy preserved')
  })()`, true)
  console.log('[qa-web] migrare fără pierderi:', legacyMigration)

  // Codex P2: print preparation must populate every page, not only
  // the near-viewport canvases used for interactive reading.
  await win.webContents.executeJavaScript(`(() => {
    window.__pdfPrintCapture = null
    window.print = () => {
      window.__pdfPrintCapture = {
        pages: document.querySelectorAll('.page-slot').length,
        ready: document.querySelectorAll('.page-slot .page[data-print-ready="true"]').length,
        canvases: document.querySelectorAll('.page-slot canvas').length
      }
    }
    document.querySelector('button[aria-label="Tipărește"]')?.click()
  })()`, true)
  let printState = null
  for (let i = 0; i < 120; i++) {
    printState = await win.webContents.executeJavaScript('window.__pdfPrintCapture', true)
    if (printState) break
    await delay(200)
  }
  console.log('[qa-web] pregătire imprimare:', printState)
  const printReady = printState?.ready === 12 && printState.canvases === 12

  // Codex P2 regression: an explicitly empty destination means the user
  // cleared annotations. A subsequent import must NOT restore legacy notes.
  await win.webContents.executeJavaScript(`(async () => {
    const files = await new Promise((resolve, reject) => {
      const req = indexedDB.open('pdf-web-files')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const key = await new Promise((resolve, reject) => {
      const req = files.transaction('files').objectStore('files').getAllKeys()
      req.onsuccess = () => resolve(req.result.find(k => k.startsWith('web:sha256:')))
      req.onerror = () => reject(req.error)
    })
    files.close()
    const db = await new Promise((resolve,reject) => {
      const req = indexedDB.open('pdf')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    await new Promise((resolve,reject) => {
      const tx = db.transaction('annotations', 'readwrite')
      tx.objectStore('annotations').put({path:key,annotations:[],updatedAt:Date.now()})
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
    db.close()
    const fileData = await (await fetch('/sample.pdf')).arrayBuffer()
    const drop = new DataTransfer()
    drop.items.add(new File([fileData], 'pdf-sample.pdf', {type:'application/pdf'}))
    window.dispatchEvent(new DragEvent('drop', {dataTransfer:drop,bubbles:true,cancelable:true}))
  })()`, true)
  await delay(1300)
  const emptyMigrationPreserved = await win.webContents.executeJavaScript(`(async () => {
    const files = await new Promise(resolve => {
      const req = indexedDB.open('pdf-web-files')
      req.onsuccess = () => resolve(req.result)
    })
    const key = await new Promise(resolve => {
      const req = files.transaction('files').objectStore('files').getAllKeys()
      req.onsuccess = () => resolve(req.result.find(k => k.startsWith('web:sha256:')))
    })
    files.close()
    const db = await new Promise(resolve => {
      const req = indexedDB.open('pdf')
      req.onsuccess = () => resolve(req.result)
    })
    const value = await new Promise(resolve => {
      const req = db.transaction('annotations').objectStore('annotations').get(key)
      req.onsuccess = () => resolve(req.result)
    })
    db.close()
    return Array.isArray(value?.annotations) && value.annotations.length === 0
  })()`,true)
  console.log('[qa-web] ștergerea intenționată nu a fost anulată:', emptyMigrationPreserved)

  // Hosted Xvfb runners may take longer to paint. Check actual text, not a
  // fixed short sleep that produces false negatives on overloaded runners.
  for (let attempt = 0; attempt < 30; attempt++) {
    const rendered = await win.webContents.executeJavaScript(
      "document.querySelectorAll('.textLayer span').length", true
    )
    if (rendered > 0) break
    await delay(500)
  }

  const state = await win.webContents.executeJavaScript(
    `(() => {
      const indicator = document.querySelector('.page-indicator__input')
      const total = document.querySelector('.page-indicator__total')
      const canvases = document.querySelectorAll('.page__canvas').length
      const layers = document.querySelectorAll('.textLayer').length
      const title = document.querySelector('.titlebar__title')?.textContent ?? ''
      const status = document.querySelector('.statusbar')?.textContent?.trim() ?? ''
      return {
        title,
        current: indicator?.value ?? null,
        total: total?.textContent ?? null,
        canvases,
        textLayers: layers,
        status
      }
    })()`,
    true
  )

  console.log('[qa-web] stare:', JSON.stringify(state))

  try {
    const image = await win.webContents.capturePage()
    fs.writeFileSync(path.join(outDir, '01-web-reading.png'), image.toPNG())
  } catch (error) {
    // An unavailable GPU/compositor on a CI runner does not invalidate the
    // DOM, PDF.js rendering, IndexedDB or error-state assertions below.
    console.warn('[qa-web] screenshot unavailable:', String(error))
  }

  // The reading session and the mirrored file must survive a reload.
  await win.reload()
  await delay(1500)
  const afterReload = await win.webContents.executeJavaScript(
    `(() => {
      const recents = document.querySelectorAll('.recent-list__item').length
      const welcome = document.querySelector('.welcome__title')?.textContent ?? null
      return { recents, welcome }
    })()`,
    true
  )
  console.log('[qa-web] după reload:', JSON.stringify(afterReload))

  // Regression: two *different* documents with the same filename must keep
  // distinct bytes, recents and annotations in IndexedDB.
  const alternate = await PDFDocument.create()
  alternate.addPage([300, 400]).drawText('Distinct PDF content', { x: 30, y: 300 })
  const secondBase64 = Buffer.from(await alternate.save()).toString('base64')
  await win.webContents.executeJavaScript(`(() => {
    const binary = atob('${secondBase64}')
    const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0))
    const transfer = new DataTransfer()
    transfer.items.add(new File([bytes], 'pdf-sample.pdf', { type: 'application/pdf' }))
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }))
  })()`)
  await delay(900)
  await win.reload()
  await delay(1200)
  const uniqueRecents = await win.webContents.executeJavaScript(
    "document.querySelectorAll('.recent-list__item').length", true
  )
  console.log('[qa-web] fișiere distincte cu același nume:', uniqueRecents)

  // A truncated PDF must fail gracefully, never crash the renderer.
  await win.webContents.executeJavaScript(`(async () => {
    const response = await fetch('/sample.pdf')
    const bytes = (await response.arrayBuffer()).slice(0, 256)
    const transfer = new DataTransfer()
    transfer.items.add(new File([bytes], 'damaged.pdf', { type: 'application/pdf' }))
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }))
  })()`)
  await delay(1200)
  const invalidHandled = await win.webContents.executeJavaScript(
    "Boolean(document.querySelector('.welcome__card--error'))", true
  )
  console.log('[qa-web] fișier trunchiat tratat:', invalidHandled)

  // Regression: a long document must not keep every visited canvas mounted.
  const longPdf = await PDFDocument.create()
  for (let i = 0; i < 140; i++) longPdf.addPage([300, 400])
  const longBase64 = Buffer.from(await longPdf.save()).toString('base64')
  await win.webContents.executeJavaScript(`(() => {
    const data=atob('${longBase64}')
    const transfer=new DataTransfer()
    transfer.items.add(new File([Uint8Array.from(data, ch=>ch.charCodeAt(0))], 'long.pdf', {type:'application/pdf'}))
    window.dispatchEvent(new DragEvent('drop',{dataTransfer:transfer,bubbles:true,cancelable:true}))
  })()`, true)
  await delay(1500)
  await win.webContents.executeJavaScript(`(() => {
    const scroll=document.querySelector('.pagearea__scroll')
    if(scroll) scroll.scrollTop=scroll.scrollHeight
  })()`, true)
  await delay(1300)
  const longState = await win.webContents.executeJavaScript(`(() => ({
    slots:document.querySelectorAll('[data-slot]').length,
    canvases:document.querySelectorAll('.page__canvas').length
  }))()`, true)
  console.log('[qa-web] pagini / canvas active:', longState)

  const ok = printReady && state.canvases > 0 && state.textLayers > 0 && state.total !== '—' &&
    uniqueRecents === 2 && invalidHandled && legacyMigration && emptyMigrationPreserved &&
    longState.slots === 140 && longState.canvases > 0 && longState.canvases < 20
  console.log(ok ? '[qa-web] OK - randare, recents fara coliziuni, eroare controlata' : '[qa-web] FAILED - regressions detected')

  win.destroy()
  server.close()
  app.exit(ok ? 0 : 1)
}

app.whenReady().then(() => {
  main().catch((error) => {
    console.error('[qa-web] a eșuat:', error)
    app.exit(1)
  })
})
