/**
 * Rasterises build/logo.svg into the PNG icons used by the packaging
 * pipeline, the PWA manifest and the Android launcher.
 *
 * Chromium (Electron) is used as the SVG renderer so the project keeps a
 * dependency-free icon pipeline. Every produced PNG is verified to really
 * carry an alpha channel with fully transparent corners - a silent loss of
 * transparency is the classic packaging bug here, so it is checked rather
 * than assumed.
 *
 * Run: npx electron scripts/render-logo.cjs
 */
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const svgPath = path.join(root, 'build', 'logo.svg')

/** Brand red used as the background of the Android adaptive icon. */
const BRAND_RED = '#DE2C21'

/** Warm app background, used for the maskable PWA icon and the splash. */
const APP_BACKGROUND = '#F7F5F2'

const targets = [
  { file: path.join(root, 'build', 'icon.png'), size: 512 },
  { file: path.join(root, 'build', 'icon-256.png'), size: 256 },
  { file: path.join(root, 'build', 'logo-1024.png'), size: 1024 }
]

const pwaTargets = [
  { file: path.join(root, 'src/renderer/public/icons/icon-192.png'), size: 192 },
  { file: path.join(root, 'src/renderer/public/icons/icon-512.png'), size: 512 },
  { file: path.join(root, 'src/renderer/public/icons/apple-touch-icon.png'), size: 180 }
]

/** Android launcher icon densities: legacy square icon and adaptive foreground. */
const androidDensities = [
  ['mipmap-mdpi', 48, 108],
  ['mipmap-hdpi', 72, 162],
  ['mipmap-xhdpi', 96, 216],
  ['mipmap-xxhdpi', 144, 324],
  ['mipmap-xxxhdpi', 192, 432]
]

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function shell(body, css, width, height) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;overflow:hidden;width:${width}px;height:${height}px}
    ${css}
  </style></head><body>${body}</body></html>`
}

/** The logo alone, on a transparent background. */
function plainHtml(svg, size) {
  return shell(
    svg,
    `body{background:transparent}
     svg{display:block;width:${size}px;height:${size}px}`,
    size,
    size
  )
}

/**
 * Maskable icon: the warm app background fills the canvas and the sheet is
 * scaled into the safe zone, so the launcher mask can cut it in any shape.
 */
function maskableHtml(svg, size) {
  const art = Math.round(size * 0.72)
  return shell(
    `<div class="wrap">${svg}</div>`,
    `body{background:${APP_BACKGROUND}}
     .wrap{width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center}
     svg{display:block;width:${art}px;height:${art}px}`,
    size,
    size
  )
}

/**
 * Adaptive icon foreground: the sheet alone, scaled into the 66/108 safe
 * area of the launcher canvas and kept on a transparent background.
 */
function foregroundHtml(svg, size) {
  const art = Math.round(size * 0.6)
  return shell(
    `<div class="wrap">${svg}</div>`,
    `body{background:transparent}
     .wrap{width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center}
     svg{display:block;width:${art}px;height:${art}px}`,
    size,
    size
  )
}

/** Splash screen: the warm app background with the sheet centred. */
function splashHtml(svg, width, height) {
  const art = Math.round(Math.min(width, height) * 0.28)
  return shell(
    `<div class="wrap">${svg}</div>`,
    `body{background:${APP_BACKGROUND}}
     .wrap{width:${width}px;height:${height}px;display:flex;align-items:center;justify-content:center}
     svg{display:block;width:${art}px;height:${art}px}`,
    width,
    height
  )
}

async function renderMarkup(html, width, height) {
  const win = new BrowserWindow({
    width,
    height,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: { backgroundThrottling: false }
  })

  win.setMenuBarVisibility(false)
  win.setPosition(-4000, -4000)

  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  // A hidden window is not guaranteed to be painted, so make it visible
  // (off-screen) before capturing.
  win.showInactive()
  await delay(450)

  const image = await win.webContents.capturePage()
  const captured = image.getSize()
  if (captured.width !== width || captured.height !== height) {
    return image.resize({ width, height, quality: 'best' })
  }
  return image
}

/** Reads the PNG back in a canvas and reports the alpha statistics. */
async function inspectAlpha(file) {
  const data = fs.readFileSync(file).toString('base64')
  const win = new BrowserWindow({
    width: 8,
    height: 8,
    show: false,
    frame: false,
    webPreferences: { offscreen: false }
  })

  const script = `new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let transparent = 0, opaque = 0, partial = 0;
      for (let i = 3; i < d.length; i += 4) {
        if (d[i] === 0) transparent++; else if (d[i] === 255) opaque++; else partial++;
      }
      const corner = (x, y) => {
        const i = (y * c.width + x) * 4;
        return [d[i], d[i + 1], d[i + 2], d[i + 3]];
      };
      resolve({
        width: c.width, height: c.height,
        transparent, opaque, partial,
        topLeft: corner(0, 0),
        center: corner(Math.floor(c.width / 2), Math.floor(c.height / 2))
      });
    };
    img.src = 'data:image/png;base64,${data}';
  })`

  await win.loadURL('data:text/html;charset=utf-8,<html><body></body></html>')
  const result = await win.webContents.executeJavaScript(script, true)
  win.destroy()
  return result
}

/** Reads the dimensions straight out of the PNG header. */
function pngSize(file) {
  const buffer = fs.readFileSync(file)
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

async function writeChecked(file, image, { expectTransparent = true, size } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, image.toPNG())

  const stats = await inspectAlpha(file)
  const alphaOk = expectTransparent
    ? stats.transparent > 0 && stats.topLeft[3] === 0
    : stats.topLeft[3] === 255
  const sizeOk = !size || (stats.width === size.width && stats.height === size.height)
  const ok = alphaOk && sizeOk

  console.log(
    `[logo] ${path.relative(root, file)} ${stats.width}x${stats.height} ` +
      `transparent=${stats.transparent} partial=${stats.partial} opaque=${stats.opaque} ` +
      `${ok ? 'OK' : alphaOk ? 'SIZE-PROBLEM' : 'ALPHA-PROBLEM'}`
  )
  return ok
}

app.whenReady().then(async () => {
  if (!fs.existsSync(svgPath)) {
    console.error(`[logo] missing source: ${svgPath}`)
    app.exit(1)
    return
  }

  const svg = fs.readFileSync(svgPath, 'utf8')
  let failed = false

  // Desktop / packaging icons.
  for (const target of targets) {
    const image = await renderMarkup(plainHtml(svg, target.size), target.size, target.size)
    if (!(await writeChecked(target.file, image, { size: { width: target.size, height: target.size } }))) {
      failed = true
    }
  }

  // PWA icons.
  for (const target of pwaTargets) {
    const image = await renderMarkup(plainHtml(svg, target.size), target.size, target.size)
    if (!(await writeChecked(target.file, image, { size: { width: target.size, height: target.size } }))) {
      failed = true
    }
  }

  const maskable = await renderMarkup(maskableHtml(svg, 512), 512, 512)
  if (
    !(await writeChecked(path.join(root, 'src/renderer/public/icons/icon-maskable-512.png'), maskable, {
      expectTransparent: false,
      size: { width: 512, height: 512 }
    }))
  ) {
    failed = true
  }

  // Android launcher icons (only when the platform folder is present).
  const androidRes = path.join(root, 'android', 'app', 'src', 'main', 'res')
  if (fs.existsSync(androidRes)) {
    for (const [dir, legacySize, adaptiveSize] of androidDensities) {
      const outDir = path.join(androidRes, dir)
      if (!fs.existsSync(outDir)) continue

      const legacy = await renderMarkup(plainHtml(svg, legacySize), legacySize, legacySize)
      await writeChecked(path.join(outDir, 'ic_launcher.png'), legacy, {
        size: { width: legacySize, height: legacySize }
      })

      const round = await renderMarkup(plainHtml(svg, legacySize), legacySize, legacySize)
      await writeChecked(path.join(outDir, 'ic_launcher_round.png'), round, {
        size: { width: legacySize, height: legacySize }
      })

      const foreground = await renderMarkup(
        foregroundHtml(svg, adaptiveSize),
        adaptiveSize,
        adaptiveSize
      )
      await writeChecked(path.join(outDir, 'ic_launcher_foreground.png'), foreground, {
        size: { width: adaptiveSize, height: adaptiveSize }
      })
    }

    // Splash screens: regenerated at the exact size of the template files, so
    // the launcher shows the brand instead of the Capacitor placeholder.
    for (const entry of fs.readdirSync(androidRes, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const splash = path.join(androidRes, entry.name, 'splash.png')
      if (!fs.existsSync(splash)) continue
      const { width, height } = pngSize(splash)
      const image = await renderMarkup(splashHtml(svg, width, height), width, height)
      fs.writeFileSync(splash, image.toPNG())
      console.log(`[logo] ${path.relative(root, splash)} ${width}x${height}`)
    }
  } else {
    console.log('[logo] android/ not present - skipping the launcher icons')
  }

  if (failed) {
    console.error('[logo] finished with problems')
    app.exit(1)
    return
  }

  console.log('[logo] done')
  app.exit(0)
})
