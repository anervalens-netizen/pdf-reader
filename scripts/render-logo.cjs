/**
 * Rasterises build/logo.svg into the PNG icons used by the packaging
 * pipeline, using Chromium (Electron) as the SVG renderer so the project
 * keeps a dependency-free icon pipeline.
 *
 * Also verifies that the produced PNG really carries an alpha channel with
 * fully transparent corners - a silent loss of transparency is the classic
 * packaging bug here, so it is checked rather than assumed.
 *
 * Run: npx electron scripts/render-logo.cjs
 */
const { app, BrowserWindow, nativeImage } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const svgPath = path.join(root, 'build', 'logo.svg')

const targets = [
  { file: path.join(root, 'build', 'icon.png'), size: 512 },
  { file: path.join(root, 'build', 'logo-1024.png'), size: 1024 },
  { file: path.join(root, 'build', 'icon-256.png'), size: 256 }
]

function htmlFor(svg, size) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:transparent;overflow:hidden}
    svg{display:block;width:${size}px;height:${size}px}
  </style></head><body>${svg}</body></html>`
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function renderSvg(svg, size) {
  const win = new BrowserWindow({
    width: size,
    height: size,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: { backgroundThrottling: false }
  })

  win.setMenuBarVisibility(false)
  win.setPosition(-4000, -4000)

  await win.loadURL(
    'data:text/html;charset=utf-8,' + encodeURIComponent(htmlFor(svg, size))
  )
  // A hidden window is not guaranteed to be painted, so make it visible
  // (off-screen) before capturing.
  win.showInactive()
  await delay(500)

  const image = await win.webContents.capturePage()
  const size2 = image.getSize()
  if (size2.width !== size || size2.height !== size) {
    return image.resize({ width: size, height: size, quality: 'best' })
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
        topRight: corner(c.width - 1, 0),
        bottomLeft: corner(0, c.height - 1),
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

app.whenReady().then(async () => {
  if (!fs.existsSync(svgPath)) {
    console.error(`[logo] missing source: ${svgPath}`)
    app.exit(1)
    return
  }

  const svg = fs.readFileSync(svgPath, 'utf8')

  for (const target of targets) {
    const image = await renderSvg(svg, target.size)
    fs.writeFileSync(target.file, image.toPNG())
    const stats = await inspectAlpha(target.file)
    const ok = stats.transparent > 0 && stats.topLeft[3] === 0
    console.log(
      `[logo] ${path.relative(root, target.file)} ${stats.width}x${stats.height} ` +
        `transparent=${stats.transparent} partial=${stats.partial} opaque=${stats.opaque} ` +
        `corner=${stats.topLeft} ${ok ? 'OK' : 'ALPHA-PROBLEM'}`
    )
    if (!ok) {
      app.exit(1)
      return
    }
  }

  // Extra sizes used by the Android launcher (mipmap densities).
  const androidRes = path.join(root, 'android', 'app', 'src', 'main', 'res')
  const densities = [
    ['mipmap-mdpi', 48],
    ['mipmap-hdpi', 72],
    ['mipmap-xhdpi', 96],
    ['mipmap-xxhdpi', 144],
    ['mipmap-xxxhdpi', 192]
  ]
  for (const [dir, size] of densities) {
    const outDir = path.join(androidRes, dir)
    if (!fs.existsSync(outDir)) continue
    const image = await renderSvg(svg, size)
    const file = path.join(outDir, 'ic_launcher.png')
    fs.writeFileSync(file, image.toPNG())
    console.log(`[logo] ${path.relative(root, file)} ${size}x${size}`)
  }

  const round = await renderSvg(svg, 512)
  fs.writeFileSync(path.join(root, 'build', 'icon-round-512.png'), round.toPNG())

  console.log('[logo] done')
  app.exit(0)
})
