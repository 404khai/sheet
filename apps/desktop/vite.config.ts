import { defineConfig, type Plugin } from 'vite'
import { cp, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

const hostPort = process.env.SHEET_DESKTOP_PORT ?? '4300'
const appPort = process.env.SHEET_DESKTOP_APP_PORT ?? '1421'
const host = `http://127.0.0.1:${hostPort}`

/** Self-hosted vendor files live with the desktop app; served + bundled. */
const fontsDirectory = fileURLToPath(new URL('./public/vendor/', import.meta.url))

function vendorFonts(): Plugin {
  return {
    name: 'sheet:vendor-fonts',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = request.url?.split('?')[0]
        if (!path?.startsWith('/vendor/')) return next()
        try {
          const file = await readFile(join(fontsDirectory, path.slice('/vendor/'.length)))
          response.setHeader(
            'content-type',
            path.endsWith('.css') ? 'text/css; charset=utf-8' : 'font/woff2',
          )
          response.end(file)
        } catch {
          next()
        }
      })
    },
    async closeBundle() {
      await cp(fontsDirectory, fileURLToPath(new URL('./dist/app/vendor/', import.meta.url)), {
        recursive: true,
      })
    },
  }
}

export default defineConfig({
  clearScreen: false,
  resolve: { tsconfigPaths: true },
  plugins: [
    vendorFonts(),
    tailwindcss(),
    tanstackRouter({ target: 'react', quoteStyle: 'single', autoCodeSplitting: true }),
    viteReact(),
  ],
  build: {
    outDir: 'dist/app',
    emptyOutDir: true,
    // The window loads from a loopback server, never from a CDN, so a source
    // map costs nothing to ship and makes a stack trace readable.
    sourcemap: true,
  },
  server: {
    host: '127.0.0.1',
    port: Number(appPort),
    strictPort: true,
    // `tauri dev` spends seconds compiling the Rust host before the window
    // exists. Warming the entry, every route and the stylesheet here moves
    // that work into that gap, so the first paint finds a transformed module
    // graph instead of compiling 240 modules while the window sits on the
    // boot splash. Warmup runs in the background and does not delay `ready`.
    warmup: {
      clientFiles: [
        './src/main.tsx',
        './src/styles.css',
        './src/routes/**/*.tsx',
      ],
    },
    watch: { ignored: ['**/src-tauri/**'] },
    // The Tauri window stays on the Rust host (:4300) and reverse-proxies this
    // server. HMR still talks to Vite directly so the host does not have to
    // bridge websockets.
    hmr: {
      protocol: 'ws',
      host: '127.0.0.1',
      port: Number(appPort),
    },
    // Kept for opening the interface in a regular browser during development.
    proxy: {
      '/api': { target: host, changeOrigin: false },
      '/desktop': { target: host, changeOrigin: false },
      '/callback': { target: host, changeOrigin: false },
      '/realtime': { target: host, ws: true, changeOrigin: false },
    },
  },
})
