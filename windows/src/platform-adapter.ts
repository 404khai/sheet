import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { homedir, platform } from 'node:os'
import { dirname, isAbsolute, join, normalize, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * Windows platform adapter for Sheet.
 * Provides safe path normalization, application data path resolution,
 * Chromium/Edge detection, and atomic file I/O handling on Windows.
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
  if (options.customDir && options.customDir.trim()) {
    return resolve(options.customDir.trim())
  }
  if (process.env.SHEET_DATA_DIR && process.env.SHEET_DATA_DIR.trim()) {
    return resolve(process.env.SHEET_DATA_DIR.trim())
  }

  const base = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming')
  const folderName = options.isDev ? 'Sheet Dev' : 'Sheet'
  return join(base, folderName)
}

/**
 * Normalizes filesystem paths on Windows, handling drive letters,
 * forward/backward slashes, and spaces safely.
 */
export function normalizeWindowsPath(inputPath: string): string {
  if (!inputPath) return ''
  // Normalize slashes to standard Windows backslash
  const resolved = isAbsolute(inputPath) ? normalize(inputPath) : resolve(inputPath)
  return resolved
}

/**
 * Converts a Windows filesystem path to a valid file:// URL.
 */
export function windowsPathToFileUrl(inputPath: string): string {
  const normalized = normalizeWindowsPath(inputPath)
  return pathToFileURL(normalized).href
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

/**
 * Writes a file atomically with Windows-specific resilience against
 * transient EPERM / EBUSY locks caused by indexing or antivirus software.
 */
export async function safeWriteAtomic(targetPath: string, content: string | Uint8Array): Promise<void> {
  const dir = dirname(targetPath)
  await mkdir(dir, { recursive: true })

  const tempPath = `${targetPath}.sheet-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`
  await writeFile(tempPath, content)

  try {
    await rename(tempPath, targetPath)
  } catch (error) {
    // Windows file locking fallback
    try {
      await rm(targetPath, { force: true })
      await rename(tempPath, targetPath)
    } catch {
      // Direct copy fallback if rename is held
      await copyFile(tempPath, targetPath)
      await rm(tempPath, { force: true }).catch(() => {})
    }
  }
}

/**
 * Tests if a given TCP port is already listening on loopback (127.0.0.1).
 */
export function isPortInUse(port: number): Promise<boolean> {
  return new Promise((res) => {
    const server = createServer()
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        res(true)
      } else {
        res(false)
      }
    })
    server.once('listening', () => {
      server.close(() => res(false))
    })
    server.listen(port, '127.0.0.1')
  })
}

/**
 * Discovers a free TCP port starting from the requested port.
 */
export async function findFreePort(startPort = 4100): Promise<number> {
  let port = startPort
  while (await isPortInUse(port)) {
    port += 1
    if (port > 65535) throw new Error('No free TCP ports available')
  }
  return port
}
