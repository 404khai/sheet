import { importWebSnapshot } from './web-import'
import { freeFrameSpot } from './web-frames'
import { NAME_ATTRIBUTE } from './web-pages'
import { type WebDocument, type WebTransaction, webId } from './web-model'

export const MAX_BROWSER_CAPTURE_BYTES = 20_000_000
const MAX_CAPTURE_NODES = 900

// Deliberately no URLs, selectors, custom properties, events or source markup.
export const CAPTURE_STYLE_PROPERTIES = [
  'color', 'background-color', 'opacity', 'border-top-width', 'border-right-width',
  'border-bottom-width', 'border-left-width', 'border-top-style', 'border-right-style',
  'border-bottom-style', 'border-left-style', 'border-top-color', 'border-right-color',
  'border-bottom-color', 'border-left-color', 'border-top-left-radius',
  'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius',
  'box-shadow', 'text-shadow', 'z-index', 'outline-width', 'outline-style',
  'outline-color', 'outline-offset', 'padding-top', 'padding-right',
  'padding-bottom', 'padding-left',
  'font-family', 'font-size', 'font-weight', 'font-style', 'font-stretch',
  'line-height', 'letter-spacing', 'word-spacing', 'text-align', 'text-transform',
  'text-decoration-line', 'text-decoration-color', 'text-decoration-style',
  'white-space', 'white-space-collapse', 'text-wrap-mode', 'text-wrap-style',
  'text-indent', 'word-break', 'overflow-wrap', 'direction', 'writing-mode',
  'overflow-x', 'overflow-y', 'object-fit', 'object-position',
] as const
const allowedStyles = new Set<string>([
  ...CAPTURE_STYLE_PROPERTIES, 'position', 'left', 'top', 'width', 'height',
  'border', 'border-width', 'border-style', 'border-color', 'border-radius',
  'padding', 'font', 'text-decoration', 'box-sizing', 'margin', 'margin-top',
  'margin-right', 'margin-bottom', 'margin-left', 'overflow', 'display', 'isolation',
])

export interface BrowserCapture {
  format: 'sheet-browser-capture'
  version: 1
  name: string
  html: string
  warnings: string[]
}

/** Snapshot geometry is frozen at capture time; the resulting layers remain editable. */
export async function captureBrowserElement(
  root: Element,
  rasterize: (element: Element) => Promise<string>,
): Promise<BrowserCapture> {
  const warnings: string[] = []
  const bounds = root.getBoundingClientRect()
  if (bounds.width < 1 || bounds.height < 1 || bounds.left < 0 || bounds.top < 0 ||
    bounds.right > window.innerWidth || bounds.bottom > window.innerHeight) {
    throw new Error('Keep the entire selected section visible. Zoom out or select a smaller section.')
  }
  const effect = (style: CSSStyleDeclaration, property: string, defaults = ['none']) => {
    const value = style.getPropertyValue(property)
    return !!value && !defaults.includes(value)
  }
  let ancestorEffect = false
  for (let ancestor = root.parentElement; ancestor; ancestor = ancestor.parentElement) {
    const style = getComputedStyle(ancestor)
    if (effect(style, 'transform') || effect(style, 'filter') || effect(style, 'opacity', ['1'])) ancestorEffect = true
    // An editable copy would reveal whatever a clipping ancestor hides; the pixels show only what is visible.
    const clips = effect(style, 'clip-path') ||
      ['overflow-x', 'overflow-y'].some((property) => effect(style, property, ['visible']))
    if (clips) {
      const box = ancestor.getBoundingClientRect()
      if (effect(style, 'clip-path') || bounds.left < box.left || bounds.top < box.top ||
        bounds.right > box.right || bounds.bottom > box.bottom) ancestorEffect = true
    }
  }
  let count = 0
  const visit = async (
    element: Element, parentBounds: DOMRect, parentStyle?: CSSStyleDeclaration, depth = 0,
  ): Promise<HTMLElement | null> => {
    if (depth > 90) throw new Error('Section is nested too deeply. Select a smaller section.')
    if (++count > MAX_CAPTURE_NODES) throw new Error('Section is too complex. Select a smaller section.')
    const style = getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    if (style.display === 'none') return null
    const children = [...element.children]
    const borderLeft = parseFloat(parentStyle?.borderLeftWidth ?? '0') || 0
    const borderTop = parseFloat(parentStyle?.borderTopWidth ?? '0') || 0
    const place = (copy: HTMLElement) => Object.assign(copy.style, {
      position: 'absolute', display: 'block', margin: '0', boxSizing: 'border-box',
      left: `${element === root ? 0 : rect.left - parentBounds.left - borderLeft}px`,
      top: `${element === root ? 0 : rect.top - parentBounds.top - borderTop}px`,
      width: `${rect.width}px`, height: `${rect.height}px`,
    })
    // Hidden or empty boxes paint nothing themselves, but visible or overflowing children still show.
    if (style.visibility === 'hidden' || rect.width < 1 || rect.height < 1) {
      const copy = document.createElement('div')
      place(copy)
      for (const property of ['z-index', 'overflow-x', 'overflow-y']) copy.style.setProperty(property, style.getPropertyValue(property))
      for (const child of children) {
        const captured = await visit(child, rect, style, depth + 1)
        if (captured) copy.append(captured)
      }
      return copy.childElementCount ? copy : null
    }
    const mixedText = children.length > 0 && [...element.childNodes].some((node) => node.nodeType === 3 && node.textContent?.trim())
    const pseudo = ['::before', '::after'].some((part) => {
      const content = getComputedStyle(element, part).content
      return content && content !== 'none' && content !== 'normal'
    })
    const unsupported = /^(svg|canvas|video|iframe|object|embed|input|textarea|select|audio)$/i.test(element.localName) ||
      !!element.shadowRoot || element.localName.includes('-') || mixedText || pseudo ||
      (element === root && ancestorEffect) ||
      ['transform', 'filter', 'backdrop-filter', 'background-image', 'clip-path',
        'mask-image', 'perspective', 'border-image-source'].some((property) => effect(style, property)) ||
      effect(style, 'opacity', ['1']) || effect(style, 'mix-blend-mode', ['normal']) ||
      effect(style, 'zoom', ['1', 'normal']) || effect(style, '-webkit-line-clamp', ['none', '0']) ||
      element.scrollTop !== 0 || element.scrollLeft !== 0 ||
      children.some((child) => getComputedStyle(child).display === 'contents') ||
      style.display === 'list-item' ||
      (children.length === 0 && /flex|grid/.test(style.display) && !!element.textContent?.trim()) ||
      effect(style, 'writing-mode', ['horizontal-tb'])
    // Images use the browser's pixels: no CORS-dependent downloads, expiring URLs or cookies in the file.
    const raster = !!unsupported || element.localName === 'img'
    const copy = document.createElement(raster ? 'img' : 'div')
    place(copy)
    if (raster) {
      // Crops must never silently omit an offscreen part of an unsupported block.
      if (rect.left < 0 || rect.top < 0 || rect.right > window.innerWidth || rect.bottom > window.innerHeight) {
        throw new Error('An image or effect extends outside the viewport. Zoom out and capture again.')
      }
      copy.setAttribute('src', await rasterize(element))
      copy.setAttribute('alt', element.getAttribute('alt') ?? '')
      // Stacking order is not in the pixels; other compositing effects are.
      copy.style.setProperty('z-index', style.getPropertyValue('z-index'))
      if (unsupported) warnings.push(`${element.localName} with unsupported visuals was captured as an image.`)
    } else {
      for (const property of CAPTURE_STYLE_PROPERTIES) {
        const value = style.getPropertyValue(property)
        if (value) copy.style.setProperty(property, value)
      }
      if (children.length === 0) copy.textContent = element.textContent
      else for (const child of children) {
        const captured = await visit(child, rect, style, depth + 1)
        if (captured) copy.append(captured)
      }
    }
    return copy
  }
  const captured = await visit(root, bounds)
  if (!captured) throw new Error('The selected section is hidden.')
  const frame = document.createElement('div')
  Object.assign(frame.style, { position: 'absolute', width: `${bounds.width}px`, height: `${bounds.height}px`, isolation: 'isolate', overflowX: 'hidden', overflowY: 'hidden' })
  frame.append(captured)
  const result: BrowserCapture = {
    format: 'sheet-browser-capture', version: 1,
    name: document.title.slice(0, 120) || 'Browser capture', html: frame.outerHTML,
    warnings: [...new Set(warnings)].slice(0, 100),
  }
  if (new TextEncoder().encode(JSON.stringify(result)).length > MAX_BROWSER_CAPTURE_BYTES) {
    throw new Error('Capture exceeds 20 MB. Select a smaller section.')
  }
  return result
}

/** Untrusted capture files never introduce network requests or executable markup. */
export function browserCaptureTransaction(
  source: WebDocument,
  input: unknown,
  parentId: string | null,
): {
  transaction: WebTransaction
  rootId: string
  box: { x: number; y: number; width: number; height: number }
  warnings: string[]
} {
  if (!input || typeof input !== 'object') throw new Error('Not a Sheet browser capture file.')
  const capture = input as Partial<BrowserCapture>
  if (capture.format !== 'sheet-browser-capture' || capture.version !== 1 ||
    typeof capture.html !== 'string' || typeof capture.name !== 'string' || capture.name.length > 120 ||
    !Array.isArray(capture.warnings) || capture.warnings.length > 100 ||
    !capture.warnings.every((warning) => typeof warning === 'string' && warning.length < 500)) {
    throw new Error('Invalid or unsupported browser capture file.')
  }
  if (new TextEncoder().encode(JSON.stringify(input)).length > MAX_BROWSER_CAPTURE_BYTES) throw new Error('Capture exceeds 20 MB.')
  // A template stays inert even for images. Validate before passing markup to the snapshot parser.
  const template = document.createElement('template')
  template.innerHTML = capture.html
  const elements = [...template.content.querySelectorAll('*')]
  if (elements.length > MAX_CAPTURE_NODES * 2) throw new Error('Capture has too many layers.')
  for (const element of elements) {
    if (!['div', 'img'].includes(element.localName)) throw new Error('Capture contains unsupported markup.')
    for (const attr of element.attributes) {
      if (!['style', 'src', 'alt'].includes(attr.name)) throw new Error('Capture contains unsupported attributes.')
      if (attr.name === 'src' && !/^data:image\/png;base64,[a-z0-9+/]+=*$/i.test(attr.value)) throw new Error('Capture images must be embedded PNGs.')
    }
    if (/url\s*\(|var\s*\(|image-set\s*\(/i.test(element.getAttribute('style') ?? '')) throw new Error('Capture contains unsupported styles.')
    if (element.localName === 'img' && !element.hasAttribute('src')) throw new Error('Capture image is missing its embedded pixels.')
    let depth = 0
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      if (++depth > 100) throw new Error('Capture layers are nested too deeply.')
    }
    const style = (element as HTMLElement).style
    for (let index = 0; index < style.length; index += 1) {
      const name = style.item(index)
      if ((name === 'position' && style.position !== 'absolute') ||
        (name === 'display' && style.display !== 'block')) throw new Error('Capture layers must use snapshot positioning.')
      if (!allowedStyles.has(name) || /url\s*\(|var\s*\(|image-set\s*\(/i.test(style.getPropertyValue(name))) {
        throw new Error(`Capture contains unsupported style: ${name}.`)
      }
    }
  }
  const imported = importWebSnapshot(capture.html).document
  if (Object.keys(imported.nodes).length > 2_000) throw new Error('Capture has too many layers. Select a smaller section.')
  if (imported.roots.length !== 1) throw new Error('Capture needs one frame.')
  const rootId = imported.roots[0]!
  const root = imported.nodes[rootId]!
  if (root.kind !== 'element' || root.tag !== 'div') throw new Error('Capture needs a frame.')
  const spot = freeFrameSpot(source, parentId)
  root.parentId = parentId
  root.order = Math.max(0, ...Object.values(source.nodes).filter((node) => node.parentId === parentId).map((node) => node.order)) + 1_024
  root.attributes[NAME_ATTRIBUTE] = capture.name || 'Browser capture'
  root.styles = { ...root.styles, position: 'absolute', left: `${spot.x}px`, top: `${spot.y}px`, overflow: 'hidden', isolation: 'isolate' }
  return {
    rootId, warnings: capture.warnings,
    box: { x: spot.x, y: spot.y, width: parseFloat(root.styles.width ?? '') || 0, height: parseFloat(root.styles.height ?? '') || 0 },
    transaction: { id: webId('webtx'), label: 'Import browser capture', operations: Object.values(imported.nodes).map((node) => ({ type: 'node.insert', node })) },
  }
}
