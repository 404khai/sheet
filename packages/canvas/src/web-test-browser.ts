import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Test-only Chromium resolution, shared by browser proof suites. Mirrors the
 * executable search in `mcp-screenshot.ts`; suites `skipIf` when no browser
 * exists so CI without Chrome stays green.
 */
export function findChromiumExecutable() {
  // Check both overrides on their own: a stale PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  // must not hide a working CHROMIUM_PATH.
  const configured = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim(),
    process.env.CHROMIUM_PATH?.trim(),
  ].filter((value): value is string => Boolean(value))
  for (const candidate of configured) {
    if (existsSync(candidate)) return candidate
  }

  const programFiles = process.env.PROGRAMFILES?.trim()
  const programFilesX86 = process.env['PROGRAMFILES(X86)']?.trim()
  const localAppData = process.env.LOCALAPPDATA?.trim()

  const candidates = [
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    // Linux
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    // Windows
    programFiles && join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    programFilesX86 && join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    localAppData && join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    programFiles && join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    programFilesX86 && join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ].filter((value): value is string => Boolean(value))
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}
