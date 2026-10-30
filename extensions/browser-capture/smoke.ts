// Reproducible real-browser smoke check. Uses an installed Playwright Chromium.
// Run: bun run extensions/browser-capture/build.ts && bun run extensions/browser-capture/smoke.ts
import { chromium } from 'playwright-core'
import { mkdtemp, readFile, cp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const directory = await mkdtemp(join(tmpdir(), 'sheet-capture-smoke-'))
const extension = join(directory, 'extension')
await cp(join(import.meta.dir, 'dist'), extension, { recursive: true })
const manifestPath = join(extension, 'manifest.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
// Headless automation cannot press a browser toolbar action to grant activeTab.
// Grant pixels/injection only in this disposable test copy; shipping manifest stays activeTab-only.
manifest.host_permissions = ['<all_urls>']
await writeFile(manifestPath, JSON.stringify(manifest))
const context = await chromium.launchPersistentContext(join(directory, 'profile'), {
  executablePath: process.env.CHROMIUM_PATH ?? chromium.executablePath(),
  headless: true, viewport: { width: 1000, height: 760 },
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  acceptDownloads: true,
})
const bundle = await Bun.build({ entrypoints: [join(import.meta.dir, '../../packages/canvas/src/browser-capture.ts')], target: 'browser' })
const modelBundle = await Bun.build({ entrypoints: [join(import.meta.dir, '../../packages/canvas/src/web-model.ts')], target: 'browser' })
const server = Bun.serve({
  port: 0, hostname: '127.0.0.1',
  fetch(request) {
    if (new URL(request.url).pathname === '/capture.js') return new Response(bundle.outputs[0], { headers: { 'Content-Type': 'text/javascript' } })
    if (new URL(request.url).pathname === '/model.js') return new Response(modelBundle.outputs[0], { headers: { 'Content-Type': 'text/javascript' } })
    return new Response(`<!doctype html><title>Localhost card</title><style>
      body { margin:40px; background:#eee; font-family:Arial }
      #card { width:520px; padding:24px; background:white; border:2px solid #ddd; border-radius:16px; display:flex; gap:24px }
      h2 { color:#172554; font-size:28px; margin:0 0 12px } p { font-size:16px; line-height:24px; margin:0 }
      .art { width:120px; height:160px; flex-shrink:0; background:linear-gradient(30deg,#7c3aed,#fb923c); border-radius:12px }
      #copy { margin-top:40px }
    </style><section id="card"><div class="art"></div><div><h2>Capture localhost</h2><p>These words remain editable in Sheet.</p></div></section><div id="copy"></div><script>window.sourceClicks=0;document.querySelector('#card').addEventListener('pointerdown',()=>window.sourceClicks++);document.querySelector('#card').addEventListener('click',()=>window.sourceClicks++)</script>` , { headers: { 'Content-Type': 'text/html' } })
  },
})
try {
  const page = await context.newPage()
  page.setDefaultTimeout(15_000)
  page.on('console', (message) => console.log('Browser:', message.text()))
  page.on('pageerror', (error) => console.error('Page error:', error.message))
  await page.goto(server.url.toString())
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
  const tabId = await worker.evaluate(async () => {
    const chrome = (globalThis as any).chrome
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] })
    // Reinject to prove the selector does not leave duplicate listeners or declarations.
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] })
    return tab.id
  })
  if (!tabId) throw new Error('No active tab')
  const hints = await page.evaluate(() => [...document.documentElement.children].filter((element) => element.textContent?.startsWith('Sheet: hover')).length)
  if (hints !== 1) throw new Error(`Reinjection left ${hints} selectors active`)
  await page.locator('#card').hover({ position: { x: 2, y: 2 } })
  const downloaded = page.waitForEvent('download')
  await page.locator('#card').click({ position: { x: 2, y: 2 } })
  const download = await downloaded.catch(async (error) => {
    console.error(await page.locator('body').textContent())
    console.error(await page.locator('html > div').allTextContents())
    throw error
  })
  const capturePath = join(directory, 'capture.sheet-capture.json')
  await download.saveAs(capturePath)
  if (await page.evaluate(() => (window as any).sourceClicks) !== 0) throw new Error('Selection interacted with the source page')
  // Capture completes with all input interception removed; Esc also restores the page.
  await worker.evaluate(async () => {
    const chrome = (globalThis as any).chrome
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] })
  })
  await page.locator('#card').click({ position: { x: 2, y: 2 } })
  if (await page.evaluate(() => (window as any).sourceClicks) !== 0) throw new Error('Selector did not intercept input before Escape')
  await page.keyboard.press('Escape')
  await page.locator('#card').click({ position: { x: 2, y: 2 } })
  if (await page.evaluate(() => (window as any).sourceClicks) !== 2) throw new Error('Cancel left page input blocked')
  const capture = JSON.parse(await readFile(capturePath, 'utf8'))
  if (!capture.html.includes('data:image/png;base64,') || !capture.html.includes('These words remain editable')) throw new Error('Missing raster or editable text')
  const summary = await page.evaluate(async (input) => {
    // Served bundles of the same sources; typed against them.
    const captureModule: string = '/capture.js'
    const modelModule: string = '/model.js'
    const { browserCaptureTransaction } = await import(captureModule) as typeof import('../../packages/canvas/src/browser-capture')
    const { applyWebTransaction, createWebDocument, serializeWebDocument } = await import(modelModule) as typeof import('../../packages/canvas/src/web-model')
    const source = createWebDocument('Smoke')
    const imported = browserCaptureTransaction(source, input, null)
    const applied = applyWebTransaction(source, imported.transaction)
    const frame = applied.document.nodes[imported.rootId]
    if (frame?.kind !== 'element') throw new Error('Capture root is not a frame')
    frame.styles.left = '0px'
    frame.styles.top = '0px'
    const host = document.querySelector('#copy') as HTMLElement
    host.style.position = 'relative'
    host.style.height = '240px'
    host.innerHTML = serializeWebDocument(applied.document)
    const undone = applyWebTransaction(applied.document, applied.inverse)
    if (JSON.stringify(undone.document.roots) !== JSON.stringify(source.roots) ||
      Object.keys(undone.document.nodes).sort().join() !== Object.keys(source.nodes).sort().join()) throw new Error('Undo left capture nodes')
    return { nodes: Object.keys(applied.document.nodes).length, warnings: imported.warnings }
  }, capture)
  await page.screenshot({ path: join(directory, 'capture-comparison.png') })
  console.log(JSON.stringify({ ...summary, directory, capturePath }, null, 2))
} finally {
  await context.close()
  server.stop()
}
