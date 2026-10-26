#!/usr/bin/env bun
import { join } from 'node:path'

/**
 * `bun dev` — the complete local app.
 *
 * Starts the local server (oRPC + MCP + SSE on SQLite), waits for `/ready`,
 * then opens the desktop window via `tauri dev`. Ctrl-C stops both.
 *
 * Flags:
 *   --server-only   just the local server (API + MCP)
 *   --desktop-only  just the Tauri window (expects a server already up)
 *
 * Env: SHEET_MCP_PORT (4100), SHEET_SQLITE_PATH (./data/sheet.db).
 * If a server is already listening, it is reused, not replaced.
 */

const root = join(import.meta.dir, '..')
const port = process.env.SHEET_MCP_PORT?.trim() || '4100'
const serverUrl = `http://127.0.0.1:${port}`
const serverOnly = process.argv.includes('--server-only')
const desktopOnly = process.argv.includes('--desktop-only')
const webOnly = process.argv.includes('--web')
const bunBin = process.execPath

process.env.SHEET_SQLITE_PATH ??= join(root, 'data', 'sheet.db')

async function serverUp() {
  try {
    const response = await fetch(`${serverUrl}/ready`)
    return response.ok
  } catch {
    return false
  }
}

const children: Array<ReturnType<typeof Bun.spawn>> = []

function spawn(name: string, cmd: string[]) {
  console.info(`[dev] starting ${name}: ${cmd.join(' ')}`)
  const child = Bun.spawn(cmd, {
    cwd: root,
    stdio: ['inherit', 'inherit', 'inherit'],
    env: { ...process.env },
  })
  children.push(child)
  return child
}

async function shutdown(code: number) {
  for (const child of [...children].reverse()) {
    try {
      child.kill()
    } catch {
      // Already gone — nothing to stop.
    }
  }
  process.exit(code)
}

process.on('SIGINT', () => void shutdown(130))
process.on('SIGTERM', () => void shutdown(143))

async function waitForServer() {
  const deadline = Date.now() + 30_000
    // The server is usually ready in about a second, and every millisecond of
    // this loop is dead time in front of the window: poll tightly at first and
    // back off, so the desktop starts the moment the API answers.
    for (let attempt = 0; ; attempt += 1) {
      if (await serverUp()) return
      if (Date.now() > deadline) {
        console.error('[dev] local server never became ready')
        await shutdown(1)
      }
      await Bun.sleep(Math.min(25 * 2 ** Math.floor(attempt / 4), 250))
    }
}

if (!desktopOnly) {
  if (await serverUp()) {
    console.info('[dev] local server already running — reusing it')
  } else {
    spawn('local server', [bunBin, 'run', '--cwd', 'apps/mcp', 'dev'])
    await waitForServer()
    console.info('[dev] local server ready')
  }
}

if (webOnly) {
  await waitForServer()
  const web = spawn('web interface', [bunBin, 'run', '--cwd', 'apps/desktop', 'dev:web'])
  await web.exited
  await shutdown(web.exitCode ?? 0)
} else if (!serverOnly) {
  await waitForServer()
  const desktop = spawn('desktop', [bunBin, 'run', '--cwd', 'apps/desktop', 'dev'])
  await desktop.exited
  await shutdown(desktop.exitCode ?? 0)
} else {
  // Stay alive as long as the spawned server does.
  const server = children[0]
  if (server) await server.exited
}
