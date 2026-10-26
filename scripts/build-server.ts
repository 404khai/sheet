import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Cross-platform server compilation script for Sheet.
 * Embeds DB migrations, creates the binaries folder if missing,
 * and compiles apps/mcp/src/local.ts to a standalone sidecar binary
 * (sheet-server.exe on Windows, sheet-server on macOS/Linux).
 */

const isWindows = process.platform === 'win32'
const root = join(import.meta.dir, '..')
const binDir = join(root, 'apps/desktop/src-tauri/binaries')
mkdirSync(binDir, { recursive: true })

const outFile = join(binDir, isWindows ? 'sheet-server.exe' : 'sheet-server')
const bunBin = process.execPath

console.log('[build:server] Embedding migrations...')
const embedProc = Bun.spawnSync([bunBin, 'run', '--cwd', 'packages/db', 'embed'], {
  cwd: root,
  stdio: ['inherit', 'inherit', 'inherit'],
})
if (embedProc.exitCode !== 0) {
  process.exit(embedProc.exitCode ?? 1)
}

console.log(`[build:server] Compiling local server to ${outFile}...`)
const compileProc = Bun.spawnSync(
  [bunBin, 'build', '--compile', 'apps/mcp/src/local.ts', '--outfile', outFile],
  {
    cwd: root,
    stdio: ['inherit', 'inherit', 'inherit'],
  },
)

if (compileProc.exitCode !== 0) {
  process.exit(compileProc.exitCode ?? 1)
}

console.log(`[build:server] Successfully built server sidecar: ${outFile}`)
