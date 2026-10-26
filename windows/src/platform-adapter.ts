import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { homedir, platform } from 'node:os'
import { join, resolve, win32 } from 'node:path'

/**
 * Windows platform adapter for Sheet.
 * Provides safe path normalization, application data path resolution,
 * Chromium/Edge detection, and loopback port helpers.
 *
 * Path parsing uses `win32` explicitly so the behaviour is identical when the
 * helpers are exercised from a non-Windows host (tests, CI).
 */

export function isWindows(): boolean {
  return platform() === 'win32'
}

/**
 * Resolves the persistent application data directory on Windows.
 * Follows the same contract as Sheet's Rust desktop host:
 *   %APPDATA%\Sheet in production
 *   %APPDATA%\Sheet Dev in development / debug mode
 * Overridable with SHEET_DATA_DIR.
 */
export function resolveAppDataDir(options: { isDev?: boolean; customDir?: string } = {}): string {
  const customDir = options.customDir?.trim()
  if (customDir) return resolve(customDir)
  const fromEnv = process.env.SHEET_DATA_DIR?.trim()
  if (fromEnv) return resolve(fromEnv)

  const base = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming')
  const folderName = options.isDev ? 'Sheet Dev' : 'Sheet'
  return join(base, folderName)
}

/**
 * Normalizes filesystem paths on Windows, handling drive letters,
 * forward/backward slashes, and spaces safely.
 */
export function normalizeWindowsPath(inputPath: string): string {
  const trimmed = inputPath.trim()
  if (!trimmed) return ''
  return win32.normalize(win32.isAbsolute(trimmed) ? trimmed : win32.resolve(trimmed))
}

/**
 * Converts a Windows filesystem path to a valid file:// URL, including UNC
 * shares and drive letters. `pathToFileURL` cannot do this off Windows: it
 * reads `C:\...` as a relative path.
 */
export function windowsPathToFileUrl(inputPath: string): string {
  const normalized = normalizeWindowsPath(inputPath)
  if (!normalized) throw new Error('Cannot convert an empty path to a file URL')

  if (normalized.startsWith('\\\\')) {
    const [host, ...rest] = normalized.slice(2).split('\\')
    return `file://${encodeURIComponent(host ?? '')}/${rest.map(encodeURIComponent).join('/')}`
  }

  const segments = normalized.replace(/\\/g, '/').split('/')
  const encoded = segments
    .map((segment, index) => (/^[A-Za-z]:$/.test(segment) && index === 0 ? segment : encodeURIComponent(segment)))
    .join('/')
  return `file:///${encoded.replace(/^\/+/, '')}`
}

/**
 * Discovers available Chromium-based browser binaries on Windows.
 * Prioritizes Google Chrome, followed by Microsoft Edge.
 */
export function findWindowsChromium(): string | null {
  const custom = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim() || process.env.CHROMIUM_PATH?.trim()
  if (custom && existsSync(custom)) return custom

  const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files'
  const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)'
  const localAppData = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')

  const candidates = [
    join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return null
}

type BindOutcome = 'free' | 'in-use' | 'unavailable'

/**
 * Tries to bind the port on loopback. `EADDRINUSE` means something is already
 * listening; any other bind error means the port cannot be used, which is
 * different from being occupied.
 */
function bindLoopback(port: number): Promise<BindOutcome> {
  return new Promise((settle) => {
    const server = createServer()
    server.once('error', (error: NodeJS.ErrnoException) => {
      settle(error.code === 'EADDRINUSE' ? 'in-use' : 'unavailable')
    })
    server.once('listening', () => {
      server.close(() => settle('free'))
    })
    server.listen(port, '127.0.0.1')
  })
}

/**
 * Tests if a given TCP port is already listening on loopback (127.0.0.1).
 */
export async function isPortInUse(port: number): Promise<boolean> {
  return (await bindLoopback(port)) === 'in-use'
}

/**
 * Discovers a free TCP port starting from the requested port.
 */
export async function findFreePort(startPort = 4100): Promise<number> {
  for (let port = startPort; port <= 65535; port += 1) {
    if ((await bindLoopback(port)) === 'free') return port
  }
  throw new Error(`No free TCP port on 127.0.0.1 at or above ${startPort}`)
}
