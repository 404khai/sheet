import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const url = process.argv[2] ?? 'http://127.0.0.1:1421/'
const executable =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim() ||
  process.env.CHROMIUM_PATH?.trim() ||
  [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    process.env.PROGRAMFILES && `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
    process.env['PROGRAMFILES(X86)'] && `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
    process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].find((p) => p && existsSync(p))

const launchOptions = executable ? { executablePath: executable, headless: true } : { headless: true }
const browser = await chromium.launch(launchOptions)
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const t0 = Date.now()
const events = []
page.on('console', (m) => {
  if (m.type() === 'error') events.push([Date.now() - t0, 'console-error', m.text().slice(0, 120)])
})

await page.addInitScript(() => {
  window.__marks = []
  const record = () => {
    const splash = document.getElementById('boot-splash')
    const root = document.getElementById('root')
    const hasContent = !!root && root.childElementCount > 0
    const what = splash
      ? 'splash-only'
      : hasContent
        ? 'app-visible'
        : 'BLANK-no-splash-no-content'
    const last = window.__marks[window.__marks.length - 1]
    if (!last || last[0] !== what) window.__marks.push([what, performance.now() | 0])
  }
  window.__iv = setInterval(record, 8)
  document.addEventListener('DOMContentLoaded', record)
})

await page.goto(url, { waitUntil: 'commit' })
await page.waitForTimeout(6000)
const marks = await page.evaluate(() => {
  clearInterval(window.__iv)
  return window.__marks
})
console.log('marks (ms since navigation start):')
for (const [what, at] of marks) console.log('  ', String(at).padStart(6), what)
console.log('\nother events:')
for (const e of events) console.log('  ', e.join(' '))

const timing = await page.evaluate(() => {
  const nav = performance.getEntriesByType('navigation')[0]
  const paint = performance.getEntriesByType('paint')
  return {
    domContentLoaded: nav?.domContentLoadedEventEnd,
    loadEvent: nav?.loadEventEnd,
    fcp: paint.find((p) => p.name === 'first-contentful-paint')?.startTime,
    requests: performance
      .getEntriesByType('resource')
      .filter((r) => r.name.includes('/src/') || r.name.includes('.vite/deps'))
      .length,
    transferred: performance
      .getEntriesByType('resource')
      .reduce((a, r) => a + (r.transferSize || 0), 0),
  }
})
console.log('\nperf:', timing)

const screenshotPath = join(tmpdir(), 'boot-final.png')
await page.screenshot({ path: screenshotPath })
console.log(`Saved screenshot to: ${screenshotPath}`)
await browser.close()
