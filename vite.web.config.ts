import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { pdfjsAssets } from './vite.shared'

const root = fileURLToPath(new URL('.', import.meta.url))
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const outDir = resolve(root, 'dist-web')

/**
 * Web / PWA build.
 *
 * The renderer is the same React application; the only difference is the
 * bridge: in the browser there is no preload script, so the renderer falls
 * back to the browser implementation of the `PdfApi` contract.
 *
 * The output is consumed by the PWA (manifest + service worker) and by the
 * Android shell, which loads the very same static bundle.
 */
export default defineConfig({
  root: resolve(root, 'src/renderer'),
  // Relative asset URLs: the bundle is served from a different origin inside
  // the Android shell than from a local web server.
  base: './',
  resolve: {
    alias: {
      '@renderer': resolve(root, 'src/renderer/src'),
      '@': resolve(root, 'src/renderer/src')
    }
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  build: {
    outDir,
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: { index: resolve(root, 'src/renderer/index.html') }
    }
  },
  plugins: [react(), pdfjsAssets({ root, outDir })]
})
