import { afterEach, describe, expect, it, vi } from 'vitest'
import { browserCaptureTransaction, captureBrowserElement, type BrowserCapture } from './browser-capture'
import { applyWebTransaction, createWebDocument, createWebElement, serializeWebDocument } from './web-model'

const png = 'data:image/png;base64,aGVsbG8='
const capture = (html = '<div style="width:300px;height:200px"><div style="color:red">Editable text</div></div>'): BrowserCapture => ({
  format: 'sheet-browser-capture', version: 1, name: 'Example', html, warnings: [],
})

afterEach(() => vi.restoreAllMocks())

describe('browser capture import', () => {
  it('inserts next to existing frames, preserves them, and undoes as one transaction', () => {
    let source = createWebDocument('Design')
    const existing = createWebElement('div', { styles: { position: 'absolute', left: '20px', top: '40px', width: '100px' } })
    source = applyWebTransaction(source, { id: 'seed', label: 'Seed', operations: [{ type: 'node.insert', node: existing }] }).document
    const before = serializeWebDocument(source)
    const imported = browserCaptureTransaction(source, capture(), null)
    const applied = applyWebTransaction(source, imported.transaction)
    expect(applied.document.nodes[existing.id]).toEqual(existing)
    expect(applied.document.roots).toHaveLength(2)
    expect(applied.document.nodes[imported.rootId]).toMatchObject({ styles: { position: 'absolute', top: '40px' }, attributes: { 'data-name': 'Example' } })
    expect(serializeWebDocument(applied.document)).toContain('Editable text')
    expect(serializeWebDocument(applyWebTransaction(applied.document, applied.inverse).document)).toEqual(before)
  })

  it('targets a named page and retains embedded assets and warnings', () => {
    let source = createWebDocument('Design')
    const page = createWebElement('div')
    source = applyWebTransaction(source, { id: 'page', label: 'Page', operations: [{ type: 'node.insert', node: page }] }).document
    const input = capture(`<div><img src="${png}" style="width:10px;height:10px"></div>`)
    input.warnings = ['canvas was rasterized']
    const imported = browserCaptureTransaction(source, input, page.id)
    expect(imported.warnings).toEqual(input.warnings)
    expect(applyWebTransaction(source, imported.transaction).document.nodes[imported.rootId]?.parentId).toBe(page.id)
    expect(JSON.stringify(imported.transaction)).toContain(png)
  })

  it.each([
    '<script>alert(1)</script><div></div>',
    '<div onclick="alert(1)"></div>',
    '<iframe src="http://localhost:4100"></iframe>',
    '<div><img src="https://example.com/private.png"></div>',
    '<div><img src="data:image/svg+xml;base64,PHN2Zz4="></div>',
    '<div style="background-image:url(https://example.com/track)"></div>',
    '<div style="--x:red"></div>',
    '<div style="position:fixed;inset:0"></div>',
    '<div><img></div>',
    '<div></div><div></div>',
  ])('rejects unsafe or unsupported files before insertion: %s', (html) => {
    const source = createWebDocument('Design')
    expect(() => browserCaptureTransaction(source, capture(html), null)).toThrow()
    expect(source.roots).toEqual([])
  })

  it('rejects unknown versions, large files, and deep trees', () => {
    const source = createWebDocument('Design')
    expect(() => browserCaptureTransaction(source, { ...capture(), version: 2 }, null)).toThrow()
    expect(() => browserCaptureTransaction(source, capture('x'.repeat(20_000_001)), null)).toThrow('20 MB')
    expect(() => browserCaptureTransaction(source, capture('<div>'.repeat(102) + '</div>'.repeat(102)), null)).toThrow('deeply')
  })
})

describe('live browser snapshot', () => {
  function fixture(html: string) {
    const host = document.createElement('section')
    host.innerHTML = html
    const rect = { left: 10, top: 10, width: 200, height: 100, right: 210, bottom: 110, x: 10, y: 10, toJSON() {} }
    for (const element of [host, ...host.querySelectorAll('*')]) {
      vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(rect)
    }
    const original = window.getComputedStyle.bind(window)
    vi.spyOn(globalThis, 'getComputedStyle').mockImplementation((element, pseudo) => {
      if (pseudo) return { content: 'none' } as CSSStyleDeclaration
      return original(element)
    })
    return host
  }

  it('captures computed text and boxes as editable, inert nodes', async () => {
    const root = fixture('<h2 style="font-size:24px;color:rgb(255, 0, 0)">Hello</h2><p>World</p>')
    const rasterize = vi.fn()
    const result = await captureBrowserElement(root, rasterize)
    const imported = browserCaptureTransaction(createWebDocument('Design'), result, null)
    expect(JSON.stringify(imported.transaction)).toContain('24px')
    expect(JSON.stringify(imported.transaction)).toContain('Hello')
    expect(rasterize).not.toHaveBeenCalled()
  })

  it('rasterizes entire unsupported subtrees, with no half-editable children', async () => {
    const root = fixture('<div style="transform:rotate(2deg)"><p>Rotated</p></div><img src="https://example.com/image.png">')
    const rasterize = vi.fn().mockResolvedValue(png)
    const result = await captureBrowserElement(root, rasterize)
    expect(rasterize).toHaveBeenCalledTimes(2)
    expect(result.html).not.toContain('Rotated')
    expect(result.html).not.toContain('example.com')
    expect(result.warnings).toHaveLength(1)
    expect(() => browserCaptureTransaction(createWebDocument('Design'), result, null)).not.toThrow()
  })

  it('keeps visible children of hidden or empty boxes and drops hidden leaves', async () => {
    const root = fixture('<div style="visibility:hidden"><p>Gone</p><p style="visibility:visible">Shown</p></div><div id="empty"><p>Overflow</p></div>')
    vi.spyOn(root.querySelector('#empty')!, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 10, width: 200, height: 0, right: 210, bottom: 10 } as DOMRect)
    const result = await captureBrowserElement(root, vi.fn())
    expect(result.html).toContain('Shown')
    expect(result.html).toContain('Overflow')
    expect(result.html).not.toContain('Gone')
    expect(() => browserCaptureTransaction(createWebDocument('Design'), result, null)).not.toThrow()
  })

  it('keeps the stacking order of rasterized blocks', async () => {
    const root = fixture('<canvas style="position:relative;z-index:5"></canvas><p>Below</p>')
    const result = await captureBrowserElement(root, vi.fn().mockResolvedValue(png))
    expect(result.html).toMatch(/<img[^>]*z-index: 5/)
  })

  it('rasterizes a section that a clipping ancestor partly hides', async () => {
    const clip = document.createElement('div')
    clip.style.overflowY = 'hidden'
    const root = fixture('<p>Partly hidden</p>')
    clip.append(root)
    vi.spyOn(clip, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 10, width: 200, height: 50, right: 210, bottom: 60 } as DOMRect)
    const rasterize = vi.fn().mockResolvedValue(png)
    const result = await captureBrowserElement(root, rasterize)
    expect(rasterize).toHaveBeenCalledWith(root)
    expect(result.html).not.toContain('Partly hidden')
  })

  it('refuses offscreen sections and propagates raster failures', async () => {
    const root = fixture('<canvas></canvas>')
    await expect(captureBrowserElement(root, async () => { throw new Error('pixels unavailable') })).rejects.toThrow('pixels unavailable')
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({ left: -10, top: 0, width: 200, height: 100, right: 190, bottom: 100 } as DOMRect)
    await expect(captureBrowserElement(root, vi.fn())).rejects.toThrow('entire selected section visible')
  })
})
