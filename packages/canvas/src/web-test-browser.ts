import { existsSync } from 'node:fs'

/**
 * Test-only Chromium resolution, shared by browser proof suites. Mirrors the
 * executable search in `mcp-screenshot.ts`; suites `skipIf` when no browser
 * exists so CI without Chrome stays green.
 */
export function findChromiumExecutable() {
  const custom = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim() || process.env.CHROMIUM_PATH?.trim()
  if (custom && existsSync(custom)) return custom

  const candidates = [
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    // Linux
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter((value): value is string => Boolean(value))
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}
