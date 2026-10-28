import { cp, readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Plugin, ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

/** Runtime assets that PDF.js loads on demand (CMaps, standard fonts, WASM). */
export const PDFJS_ASSETS = ['cmaps', 'standard_fonts', 'wasm']

/**
 * Copies the PDF.js runtime assets next to the bundle and serves the same
 * paths during development.
 *
 * Shared by the Electron renderer and the web/PWA build so both resolve
 * exactly the same URLs (`./cmaps/`, `./standard_fonts/`, `./wasm/`).
 */
export function pdfjsAssets(options: { root: string; outDir: string }): Plugin[] {
  const pdfjsDir = resolve(options.root, 'node_modules/pdfjs-dist')

  const copy: Plugin = {
    name: 'pdf:copy-pdfjs-assets',
    apply: 'build',
    async closeBundle() {
      for (const asset of PDFJS_ASSETS) {
        const from = resolve(pdfjsDir, asset)
        const to = resolve(options.outDir, asset)
        try {
          await stat(from)
          await cp(from, to, { recursive: true })
        } catch (error) {
          console.warn(`[pdf] could not copy ${asset}:`, error)
        }
      }
    }
  }

  const serve: Plugin = {
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

  return [copy, serve]
}
