import { cp, readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin, ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

const root = fileURLToPath(new URL('.', import.meta.url))
const pdfjsDir = resolve(root, 'node_modules/pdfjs-dist')
const rendererOut = resolve(root, 'out/renderer')

/** Runtime assets that PDF.js loads on demand (CMaps, standard fonts, WASM). */
const PDFJS_ASSETS = ['cmaps', 'standard_fonts', 'wasm']

function copyPdfjsAssets(): Plugin {
  return {
    name: 'pdf:copy-pdfjs-assets',
    apply: 'build',
    async closeBundle() {
      for (const asset of PDFJS_ASSETS) {
        const from = resolve(pdfjsDir, asset)
        const to = resolve(rendererOut, asset)
        try {
          await stat(from)
          await cp(from, to, { recursive: true })
        } catch (error) {
          console.warn(`[pdf] could not copy ${asset}:`, error)
        }
      }
    }
  }
}

/** Serves the same assets during development. */
function servePdfjsAssets(): Plugin {
  return {
    name: 'pdf:serve-pdfjs-assets',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((request: IncomingMessage, response: ServerResponse, next: () => void) => {
        const url = (request.url ?? '').split('?')[0]
        const asset = PDFJS_ASSETS.find((name) => url.startsWith(`/${name}/`))
        if (!asset) {
          next()
          return
        }
        const filePath = resolve(pdfjsDir, `.${url}`)
        stat(filePath)
          .then(async (stats) => {
            if (!stats.isFile()) {
              next()
              return
            }
            response.setHeader('Content-Type', 'application/octet-stream')
            response.end(await readFile(filePath))
          })
          .catch(() => next())
      })
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(root, 'src/main/index.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(root, 'src/preload/index.ts') }
      }
    }
  },
  renderer: {
    root: resolve(root, 'src/renderer'),
    resolve: {
      alias: {
        '@renderer': resolve(root, 'src/renderer/src'),
        '@': resolve(root, 'src/renderer/src')
      }
    },
    build: {
      rollupOptions: {
        input: { index: resolve(root, 'src/renderer/index.html') }
      }
    },
    plugins: [react(), copyPdfjsAssets(), servePdfjsAssets()]
  }
})
