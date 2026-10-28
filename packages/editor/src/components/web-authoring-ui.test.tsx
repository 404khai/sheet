import { fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyWebTransaction,
  assertWebDocument,
  createWebDocument,
  createWebElement,
  createWebText,
  type WebDocument,
} from '@sheet/canvas/web-model'
import { iconNodes } from '@sheet/canvas/web-icons'
import { cacheShortcuts } from '../lib/shortcuts'
import { WebCanvasEditor } from './web-editor'

const applyTransaction = vi.hoisted(() => vi.fn())
const getWebCanvas = vi.hoisted(() => vi.fn())
const listAssets = vi.hoisted(() => vi.fn())
vi.mock('@sheet/rpc/client', () => ({
  orpc: { webCanvas: { applyTransaction, get: getWebCanvas }, asset: { list: listAssets } },
}))

class FakeEventSource extends EventTarget {
  static latest: FakeEventSource | null = null

  constructor(_url: string | URL) {
    super()
    FakeEventSource.latest = this
  }

  close() {}
}

const originalEventSource = globalThis.EventSource

function instanceFixture() {
  let document = assertWebDocument(createWebDocument('Instance UI', 'instance-ui'))
  const button = createWebElement('button', {
    id: 'btn-template',
    parentId: null,
    order: 1_024,
    attributes: { class: 'btn' },
  })
  const label = createWebElement('span', {
    id: 'btn-label-template',
    parentId: 'btn-template',
    order: 1_024,
  })
  const labelText = createWebText('Label', {
    id: 'btn-label-text-template',
    parentId: 'btn-label-template',
    order: 1_024,
  })
  document = applyWebTransaction(document, {
    id: 'define',
    label: 'Define',
    operations: [{
      type: 'component.define',
      component: { id: 'button', name: 'Button', templateRootIds: ['btn-template'], stylesheetId: null },
      template: [button, label, labelText],
    }],
  }).document
  document = applyWebTransaction(document, {
    id: 'create',
    label: 'Create',
    operations: [{ type: 'instance.create', id: 'a', componentId: 'button', parentId: null, order: 1_024 }],
  }).document
  return document
}

function flexFixture() {
  const document = createWebDocument('Flex UI', 'flex-ui')
  document.nodes.card = createWebElement('div', {
    id: 'card',
    order: 1_024,
    attributes: { class: 'card' },
    styles: { width: '800px', height: '600px', display: 'flex', gap: '16px' },
  })
  document.roots = ['card']
  return assertWebDocument(document)
}

function renderEditor(initialDocument: WebDocument) {
  applyTransaction.mockResolvedValue({ revision: 2, document: initialDocument })
  return render(
    <div className="h-[800px] w-[1200px]">
      <WebCanvasEditor
        designId="authoring-ui"
        initialDocument={initialDocument}
        initialRevision={1}
        name="Authoring UI"
      />
    </div>,
  )
}

async function commitInput(label: string, view: ReturnType<typeof render>, value: string) {
  const input = view.getByLabelText(label)
  expect(input).toBeInstanceOf(HTMLInputElement)
  fireEvent.change(input, { target: { value } })
  fireEvent.blur(input)
  await waitFor(() => {
    expect(applyTransaction).toHaveBeenCalled()
  })
  return applyTransaction.mock.calls.at(-1)?.[0] as {
    transaction: { operations: unknown[] }
  }
}

function stubPointerCapture() {
  const proto = Element.prototype as Element & {
    setPointerCapture?: (id: number) => void
    releasePointerCapture?: (id: number) => void
  }
  proto.setPointerCapture = vi.fn()
  proto.releasePointerCapture = vi.fn()
}

function unstubPointerCapture() {
  const proto = Element.prototype as {
    setPointerCapture?: ((id: number) => void) | undefined
    releasePointerCapture?: ((id: number) => void) | undefined
  }
  delete proto.setPointerCapture
  delete proto.releasePointerCapture
}

function iconFixture() {
  const document = createWebDocument('Icon UI', 'icon-ui')
  document.nodes.card = createWebElement('div', { id: 'card', order: 1_024, styles: { width: '800px', height: '600px' } })
  const nodes = iconNodes('lucide', 'heart', { parentId: 'card', order: 1_024, color: '#ff0000' })
  for (const node of nodes ?? []) document.nodes[node.id] = node
  document.roots = ['card']
  return assertWebDocument(document)
}

function positionedFixture(styles: Record<string, string>) {
  const document = createWebDocument('Positioned UI', 'positioned-ui')
  document.nodes.card = createWebElement('div', {
    id: 'card',
    order: 1_024,
    attributes: { class: 'card' },
    styles,
  })
  document.roots = ['card']
  return assertWebDocument(document)
}

function childrenFixture() {
  const document = createWebDocument('Reorder UI', 'reorder-ui')
  document.nodes.card = createWebElement('div', {
    id: 'card',
    order: 1_024,
    attributes: { class: 'card' },
    styles: { width: '800px', height: '600px', display: 'flex' },
  })
  document.nodes.one = createWebElement('div', { id: 'one', parentId: 'card', order: 1_024 })
  document.nodes.two = createWebElement('div', { id: 'two', parentId: 'card', order: 2_048 })
  document.roots = ['card']
  return assertWebDocument(document)
}

async function dragHandle(
  view: ReturnType<typeof render>,
  selector: string,
  down: { x: number; y: number },
  up: { x: number; y: number },
) {
  const handle = await waitFor(() => {
    const element = view.container.querySelector(selector)
    expect(element).not.toBeNull()
    return element as Element
  })
  fireEvent.pointerDown(handle, { pointerId: 1, clientX: down.x, clientY: down.y, button: 0 })
  fireEvent.pointerMove(handle, { pointerId: 1, clientX: (down.x + up.x) / 2, clientY: (down.y + up.y) / 2 })
  fireEvent.pointerUp(handle, { pointerId: 1, clientX: up.x, clientY: up.y })
  await waitFor(() => {
    expect(applyTransaction).toHaveBeenCalled()
  })
}

describe('authoring commits map to web transactions', () => {
  beforeEach(() => {
    applyTransaction.mockReset()
    getWebCanvas.mockReset()
    listAssets.mockReset().mockResolvedValue([])
    window.localStorage.clear()
    Object.defineProperty(globalThis, 'EventSource', {
      configurable: true,
      value: FakeEventSource,
    })
    stubPointerCapture()
  })

  afterEach(() => {
    Object.defineProperty(globalThis, 'EventSource', {
      configurable: true,
      value: originalEventSource,
    })
    FakeEventSource.latest = null
    unstubPointerCapture()
  })

  it('reloads the live document when an MCP edit announces a newer revision', async () => {
    const initial = flexFixture()
    const latest = structuredClone(initial)
    latest.nodes.label = createWebText('Agent update', {
      id: 'label',
      parentId: 'card',
      order: 1_024,
    })
    getWebCanvas.mockResolvedValue({
      status: 'ready',
      revision: 2,
      document: assertWebDocument(latest),
    })
    const view = renderEditor(initial)

    FakeEventSource.latest?.dispatchEvent(new MessageEvent('canvas', {
      data: JSON.stringify({ type: 'canvas.changed', revision: 2, nodeIds: ['label'], sentAt: 1 }),
    }))

    await waitFor(() => expect(view.getByText('Agent update')).toBeTruthy())
    expect(getWebCanvas).toHaveBeenCalledWith({ designId: 'authoring-ui' })
  })

  it('routes bound attribute edits to instance.setOverride, never node.patch', async () => {
    const document = instanceFixture()
    const rootId = document.instances.a?.rootId as string
    const view = renderEditor(document)

    await waitFor(() => {
      expect(view.getByText('Instance override · attributes')).toBeTruthy()
    })
    const sent = await commitInput('class', view, 'btn primary')
    expect(sent.transaction.operations).toEqual([{
      type: 'instance.setOverride',
      instanceId: 'a',
      id: rootId,
      override: { kind: 'attributes', attributes: { class: 'btn primary' } },
    }])
  })

  it('deletes the instance through instance.delete from the inspector', async () => {
    const view = renderEditor(instanceFixture())
    await waitFor(() => {
      expect(view.getByText('Delete instance')).toBeTruthy()
    })
    fireEvent.click(view.getByText('Delete instance'))
    await waitFor(() => {
      expect(applyTransaction).toHaveBeenCalled()
    })
    const sent = applyTransaction.mock.calls.at(-1)?.[0] as {
      transaction: { operations: unknown[] }
    }
    expect(sent.transaction.operations).toEqual([{ type: 'instance.delete', id: 'a' }])
  })

  it('commits layout edits as authored inline CSS patches', async () => {
    const view = renderEditor(flexFixture())
    const select = view.getByLabelText('flex-direction')
    expect(select.tagName).toBe('SELECT')
    fireEvent.change(select, { target: { value: 'column' } })
    await waitFor(() => expect(applyTransaction).toHaveBeenCalled())
    const sent = applyTransaction.mock.calls.at(-1)?.[0] as { transaction: { operations: unknown[] } }
    expect(sent.transaction.operations).toEqual([{
      type: 'node.patch',
      id: 'card',
      patch: { kind: 'element', styles: { 'flex-direction': 'column' } },
    }])
  })

  it('commits absolute moves from authored start plus delta, ignoring preview pollution', async () => {
    const view = renderEditor(positionedFixture({
      position: 'absolute',
      left: '100px',
      top: '50px',
      width: '200px',
      height: '100px',
    }))
    await dragHandle(view, '.cursor-move', { x: 0, y: 0 }, { x: 17, y: 0 })
    // Pollute the preview after the gesture: persistence must not read it.
    const host = view.container.querySelector('[data-sheet-node="card"]') as HTMLElement
    host.style.left = '999px'
    const sent = applyTransaction.mock.calls.at(-1)?.[0] as {
      transaction: { operations: Array<{ patch?: { styles?: Record<string, string> } }> }
    }
    // Zoom is 0.75: 100 + 17 / 0.75 = 122.67 — authored plus logical delta.
    expect(sent.transaction.operations).toEqual([{
      type: 'node.patch',
      id: 'card',
      patch: { kind: 'element', styles: { left: '122.67px', top: '50px' } },
    }])
  })

  it('establishes a missing absolute start once instead of inventing position', async () => {
    const view = renderEditor(positionedFixture({ position: 'absolute', width: '200px' }))
    await dragHandle(view, '.cursor-move', { x: 0, y: 0 }, { x: 17, y: 0 })
    const sent = applyTransaction.mock.calls.at(-1)?.[0] as {
      transaction: { operations: Array<{ patch?: { styles?: Record<string, string> } }> }
    }
    // No authored left/top: JSDOM geometry is zero, established once, then delta.
    expect(sent.transaction.operations).toEqual([{
      type: 'node.patch',
      id: 'card',
      patch: { kind: 'element', styles: { left: '22.67px', top: '0px' } },
    }])
  })

  it('resizes a page root from its measured size when authored sizing is fluid', async () => {
    const view = renderEditor(positionedFixture({ width: '50%', height: 'auto' }))
    const root = view.container.querySelector<HTMLElement>('[data-sheet-node="card"]')
    expect(root).not.toBeNull()
    if (!root) throw new Error('Expected the page root')
    root.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 600,
      bottom: 300,
      width: 600,
      height: 300,
      toJSON: () => ({}),
    })
    await dragHandle(view, '[aria-label="Resize element"]', { x: 0, y: 0 }, { x: 75, y: 30 })
    const sent = applyTransaction.mock.calls.at(-1)?.[0] as {
      transaction: { operations: unknown[] }
    }
    expect(sent.transaction.operations).toEqual([{
      type: 'node.patch',
      id: 'card',
      patch: { kind: 'element', styles: { width: '900px', height: '440px' } },
    }])
  })

  it('declines non-pixel resizes for nested responsive elements', async () => {
    const document = positionedFixture({ width: '800px', height: '600px' })
    document.nodes.child = createWebElement('div', {
      id: 'child',
      parentId: 'card',
      order: 1_024,
      styles: { width: '50%', height: 'auto' },
    })
    const view = renderEditor(assertWebDocument(document))
    fireEvent.click(view.container.querySelector('[data-sheet-node="child"]') as Element)
    const handle = await waitFor(() => {
      const element = view.container.querySelector('[aria-label="Resize element"]')
      expect(element).not.toBeNull()
      return element as Element
    })
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 0, clientY: 0, button: 0 })
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 37, clientY: 10 })
    await waitFor(() => expect(view.getByRole('alert')).toBeTruthy())
    expect(applyTransaction).not.toHaveBeenCalled()
    expect(view.getByRole('alert').textContent).toContain('width: 50%')
  })

  it('keeps flow drags reorder-only with no positioned CSS', async () => {
    const view = renderEditor(childrenFixture())
    const child = view.container.querySelector('[data-sheet-node="one"]') as Element
    fireEvent.click(child)
    await dragHandle(view, '.cursor-move', { x: 0, y: 0 }, { x: 500, y: 0 })
    const sent = applyTransaction.mock.calls.at(-1)?.[0] as {
      transaction: { operations: unknown[] }
    }
    expect(sent.transaction.operations).toEqual([{
      type: 'node.move',
      id: 'one',
      parentId: 'card',
      order: 3_072,
    }])
    expect(JSON.stringify(sent.transaction)).not.toContain('absolute')
    expect(JSON.stringify(sent.transaction)).not.toContain('left')
  })

  it('keeps rapid edits visible and saves them in order while the first request is pending', async () => {
    const view = renderEditor(flexFixture())
    let completeFirst: ((value: { revision: number; document: WebDocument }) => void) | undefined
    applyTransaction.mockImplementationOnce(() => new Promise((resolve) => { completeFirst = resolve }))
    fireEvent.click(view.getByRole('button', { name: 'Rectangle' }))
    const stage = view.container.querySelector('main.bg-cx-canvas') as Element
    fireEvent.click(stage, { clientX: 400, clientY: 400 })
    fireEvent.click(stage, { clientX: 450, clientY: 450 })
    expect(view.container.querySelectorAll('[data-sheet-node]')).toHaveLength(3)
    expect(applyTransaction).toHaveBeenCalledTimes(1)
    const first = applyTransaction.mock.calls[0]?.[0] as { transaction: Parameters<typeof applyWebTransaction>[1] }
    applyTransaction.mockImplementationOnce(({ transaction }: { transaction: Parameters<typeof applyWebTransaction>[1] }) => ({
      revision: 3,
      document: applyWebTransaction(applyWebTransaction(flexFixture(), first.transaction).document, transaction).document,
    }))
    completeFirst?.({ revision: 2, document: applyWebTransaction(flexFixture(), first.transaction).document })
    await waitFor(() => expect(applyTransaction).toHaveBeenCalledTimes(2))
    expect(view.container.querySelectorAll('[data-sheet-node]')).toHaveLength(3)
  })

  it('keeps an unsaved drawing on the canvas and retries a failed save', async () => {
    const view = renderEditor(flexFixture())
    applyTransaction.mockRejectedValueOnce(new Error('Offline'))
    fireEvent.click(view.getByRole('button', { name: 'Rectangle' }))
    fireEvent.click(view.container.querySelector('main.bg-cx-canvas') as Element, { clientX: 400, clientY: 400 })
    await waitFor(() => expect(view.getByRole('alert').textContent).toContain('Offline'))
    expect(view.container.querySelectorAll('[data-sheet-node]')).toHaveLength(2)
    const sent = applyTransaction.mock.calls[0]?.[0] as { transaction: Parameters<typeof applyWebTransaction>[1] }
    applyTransaction.mockResolvedValue({ revision: 2, document: applyWebTransaction(flexFixture(), sent.transaction).document })
    fireEvent.click(view.getByRole('button', { name: 'Retry save' }))
    await waitFor(() => expect(applyTransaction).toHaveBeenCalledTimes(2))
    expect(view.container.querySelectorAll('[data-sheet-node]')).toHaveLength(2)
  })

  it('previews a rectangle while dragging and commits one measured shape on release', async () => {
    const view = renderEditor(flexFixture())
    fireEvent.click(view.getByRole('button', { name: 'Rectangle' }))
    const stage = view.container.querySelector('main.bg-cx-canvas') as Element
    fireEvent.pointerDown(stage, { pointerId: 4, button: 0, clientX: 40, clientY: 50 })
    fireEvent.pointerMove(stage, { pointerId: 4, clientX: 140, clientY: 130 })
    expect(view.getByTestId('drawing-preview')).toBeTruthy()
    expect(applyTransaction).not.toHaveBeenCalled()
    fireEvent.pointerUp(stage, { pointerId: 4, clientX: 140, clientY: 130 })
    await waitFor(() => expect(applyTransaction).toHaveBeenCalledTimes(1))
    const sent = applyTransaction.mock.calls[0]?.[0] as {
      transaction: { operations: Array<{ node?: { styles: Record<string, string> } }> }
    }
    expect(sent.transaction.operations[0]?.node?.styles.width).toMatch(/px$/)
    expect(sent.transaction.operations[0]?.node?.styles.height).toMatch(/px$/)
    expect(view.queryByTestId('drawing-preview')).toBeNull()
  })

  it('shows icon settings for a selected icon and restyles it through node.patch', async () => {
    const view = renderEditor(iconFixture())
    const layer = await view.findAllByText('svg')
    fireEvent.click(layer[0] as HTMLElement)
    const size = await view.findByLabelText('Icon size')
    expect(size).toBeTruthy()
    fireEvent.change(size, { target: { value: '48' } })
    fireEvent.blur(size)
    await waitFor(() => expect(applyTransaction).toHaveBeenCalled())
    const sent = applyTransaction.mock.calls.at(-1)?.[0] as { transaction: { operations: unknown[] } }
    expect(sent.transaction.operations).toEqual([{
      type: 'node.patch',
      id: expect.any(String),
      patch: { kind: 'element', styles: { width: '48px', height: '48px' } },
    }])
  })

  it('offers font weight as a dropdown', async () => {
    const view = renderEditor(flexFixture())
    const weight = await view.findByLabelText('font-weight')
    expect(weight.tagName).toBe('SELECT')
    fireEvent.change(weight, { target: { value: '600' } })
    await waitFor(() => expect(applyTransaction).toHaveBeenCalled())
    const sent = applyTransaction.mock.calls.at(-1)?.[0] as { transaction: { operations: unknown[] } }
    expect(sent.transaction.operations).toEqual([{
      type: 'node.patch',
      id: 'card',
      patch: { kind: 'element', styles: { 'font-weight': '600' } },
    }])
  })

  it('opens the icon library from the four-diamond toolbar button and inserts an SVG icon', async () => {
    const view = renderEditor(flexFixture())
    fireEvent.click(view.getByRole('button', { name: 'Icon library' }))
    expect(view.getByRole('searchbox', { name: 'Search icons' })).toBeTruthy()
    fireEvent.change(view.getByRole('searchbox', { name: 'Search icons' }), { target: { value: 'search' } })
    const [searchIcon] = await view.findAllByRole('button', { name: 'Insert Search icon' })
    if (!searchIcon) throw new Error('Search icon missing')
    fireEvent.click(searchIcon)
    await waitFor(() => expect(applyTransaction).toHaveBeenCalled())
    const sent = applyTransaction.mock.calls.at(-1)?.[0] as {
      transaction: { operations: Array<{ node?: { tag: string; namespace: string } }> }
    }
    expect(sent.transaction.operations[0]?.node).toMatchObject({ tag: 'svg', namespace: 'svg' })
    expect(sent.transaction.operations.some((operation) => operation.node?.tag === 'path')).toBe(true)
  })

  it('opens the asset library from Image and inserts a chosen image with its source', async () => {
    listAssets.mockResolvedValue([{ id: 'asset-1', name: 'Photo', mediaType: 'image/png', size: 100, url: '/api/asset/asset-1' }])
    const view = renderEditor(flexFixture())
    fireEvent.click(view.getByRole('button', { name: 'Image' }))
    const photo = await view.findByTitle('Place Photo')
    fireEvent.click(photo)
    await waitFor(() => expect(applyTransaction).toHaveBeenCalled())
    const sent = applyTransaction.mock.calls.at(-1)?.[0] as {
      transaction: { operations: Array<{ node?: { tag: string; attributes: Record<string, string> } }> }
    }
    expect(sent.transaction.operations[0]?.node).toMatchObject({ tag: 'img', attributes: { src: '/api/asset/asset-1', alt: 'Photo' } })
  })

  it('opens a color picker from the Fill swatch and applies the chosen color', async () => {
    const view = renderEditor(flexFixture())
    const picker = view.getByLabelText('Fill color')
    expect(picker.getAttribute('type')).toBe('color')
    const openPicker = vi.spyOn(picker, 'click')
    fireEvent.click(view.getByRole('button', { name: 'Choose fill color' }))
    expect(openPicker).toHaveBeenCalledOnce()
    fireEvent.change(picker, { target: { value: '#ff0000' } })
    await waitFor(() => expect(applyTransaction).toHaveBeenCalled())
    const sent = applyTransaction.mock.calls.at(-1)?.[0] as { transaction: { operations: unknown[] } }
    expect(sent.transaction.operations).toEqual([{
      type: 'node.patch', id: 'card',
      patch: { kind: 'element', attributes: undefined, styles: { background: '#ff0000' }, tag: undefined },
    }])
  })

  it('does not capture toolbar pointer presses while the hand tool is active', () => {
    const view = renderEditor(flexFixture())
    fireEvent.click(view.getByRole('button', { name: 'Hand' }))
    const frame = view.getByRole('button', { name: 'Frame' })
    fireEvent.pointerDown(frame, { pointerId: 7, button: 0 })
    expect(Element.prototype.setPointerCapture).not.toHaveBeenCalled()
    fireEvent.pointerUp(frame, { pointerId: 7 })
    fireEvent.click(frame)
    expect(frame.getAttribute('aria-pressed')).toBe('true')
  })

  it('selects tools by click without inserting into the toolbar, then creates on the page', async () => {
    const view = renderEditor(flexFixture())
    const frame = view.getByRole('button', { name: 'Frame' })
    fireEvent.click(frame)
    expect(frame.getAttribute('aria-pressed')).toBe('true')
    expect(applyTransaction).not.toHaveBeenCalled()
    fireEvent.click(view.container.querySelector('[data-sheet-node="card"]') as Element)
    await waitFor(() => expect(applyTransaction).toHaveBeenCalledTimes(1))
    // Editor returns to select tool after frame is placed
    expect(frame.getAttribute('aria-pressed')).toBe('false')
    for (const name of ['Rectangle', 'Text', 'Image']) {
      const button = view.getByRole('button', { name })
      fireEvent.click(button)
      expect(button.getAttribute('aria-pressed')).toBe('true')
    }
    expect(applyTransaction).toHaveBeenCalledTimes(1)
  })

  it('selects the sidebar page and resizes the document rather than a child', async () => {
    const view = renderEditor(childrenFixture())
    fireEvent.click(view.getByRole('button', { name: 'Page 1' }))
    expect(view.getByLabelText('Page width')).toBeTruthy()
    expect(view.getByLabelText('Page height')).toBeTruthy()
    const height = view.getByLabelText('Page height')
    fireEvent.change(height, { target: { value: '2400' } })
    fireEvent.blur(height)
    await waitFor(() => expect(applyTransaction).toHaveBeenCalled())
    const sent = applyTransaction.mock.calls.at(-1)?.[0] as {
      transaction: { operations: unknown[] }
    }
    expect(sent.transaction.operations).toEqual([{
      type: 'page.resize', width: 800, height: 2400,
    }])
  })

  it('lets the top-left corner resize with a grab cursor and live bounds', async () => {
    const view = renderEditor(flexFixture())
    fireEvent.click(view.getByRole('button', { name: 'Page 1' }))
    const corner = view.getByRole('button', { name: 'Resize page from top left' })
    expect(corner.className).toContain('cursor-nwse-resize')
    const page = view.getByTestId('page-bounds')
    fireEvent.pointerDown(corner, { pointerId: 9, button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(corner, { pointerId: 9, clientX: -75, clientY: -75 })
    expect(page.style.width).toBe('900px')
    expect(page.style.height).toBe('700px')
    expect(page.style.transform).toContain('translate(245px, 45px)')
    expect(applyTransaction).not.toHaveBeenCalled()
    applyTransaction.mockImplementationOnce(({ transaction }: { transaction: Parameters<typeof applyWebTransaction>[1] }) => ({
      revision: 2, document: applyWebTransaction(flexFixture(), transaction).document,
    }))
    fireEvent.pointerUp(corner, { pointerId: 9, clientX: -75, clientY: -75 })
    await waitFor(() => expect(applyTransaction).toHaveBeenCalledTimes(1))
  })

  it.each([
    ['top right', 75, -75, 'translate(320px, 45px)', 'cursor-nesw-resize'],
    ['bottom left', -75, 75, 'translate(245px, 120px)', 'cursor-nesw-resize'],
  ] as const)('resizes from %s with the matching cursor', async (label, x, y, transform, cursor) => {
    const view = renderEditor(flexFixture())
    fireEvent.click(view.getByRole('button', { name: 'Page 1' }))
    const corner = view.getByRole('button', { name: `Resize page from ${label}` })
    expect(corner.className).toContain(cursor)
    fireEvent.pointerDown(corner, { pointerId: 10, button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(corner, { pointerId: 10, clientX: x, clientY: y })
    const page = view.getByTestId('page-bounds')
    expect(page.style.width).toBe('900px')
    expect(page.style.height).toBe('700px')
    expect(page.style.transform).toContain(transform)
    fireEvent.pointerUp(corner, { pointerId: 10, clientX: x, clientY: y })
    await waitFor(() => expect(applyTransaction).toHaveBeenCalledTimes(1))
  })

  it('highlights every page corner and previews page cropping during the drag', async () => {
    const view = renderEditor(flexFixture())
    fireEvent.click(view.getByRole('button', { name: 'Page 1' }))
    expect(view.getAllByTestId('page-corner')).toHaveLength(4)
    const page = view.getByTestId('page-bounds')
    const initialWidth = Number.parseFloat(page.style.width)
    const handle = view.getByRole('button', { name: 'Resize page' })
    fireEvent.pointerDown(handle, { pointerId: 8, button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(handle, { pointerId: 8, clientX: 75, clientY: 75 })
    expect(Number.parseFloat(page.style.width)).toBeGreaterThan(initialWidth)
    expect(applyTransaction).not.toHaveBeenCalled()
    applyTransaction.mockImplementationOnce(({ transaction }: { transaction: Parameters<typeof applyWebTransaction>[1] }) => ({
      revision: 2, document: applyWebTransaction(flexFixture(), transaction).document,
    }))
    fireEvent.pointerUp(handle, { pointerId: 8, clientX: 75, clientY: 75 })
    await waitFor(() => expect(applyTransaction).toHaveBeenCalledTimes(1))
    expect(page.style.width).toBe('900px')
  })

  it('resizes the page from its own handle', async () => {
    const view = renderEditor(flexFixture())
    fireEvent.click(view.getByRole('button', { name: 'Page 1' }))
    const handle = view.getByRole('button', { name: 'Resize page' })
    fireEvent.pointerDown(handle, { pointerId: 2, clientX: 0, clientY: 0, button: 0 })
    fireEvent.pointerUp(handle, { pointerId: 2, clientX: 80, clientY: 40 })
    await waitFor(() => expect(applyTransaction).toHaveBeenCalled())
    const sent = applyTransaction.mock.calls.at(-1)?.[0] as { transaction: { operations: unknown[] } }
    expect(sent.transaction.operations).toEqual([{
      type: 'page.resize', width: 906.67, height: 653.33,
    }])
  })

  it('creates a real SVG path when the Pen tool is clicked and used on the page', async () => {
    const view = renderEditor(flexFixture())
    const pen = view.getByRole('button', { name: 'Pen' })
    fireEvent.click(pen)
    expect(pen.getAttribute('aria-pressed')).toBe('true')
    expect(applyTransaction).not.toHaveBeenCalled()
    fireEvent.click(view.container.querySelector('[data-sheet-node="card"]') as Element, { clientX: 30, clientY: 40 })
    await waitFor(() => expect(applyTransaction).toHaveBeenCalledTimes(1))
    const sent = applyTransaction.mock.calls[0]?.[0] as {
      transaction: { operations: Array<{ type: string; node?: { tag: string; namespace: string } }> }
    }
    expect(sent.transaction.operations.map((op) => op.node?.tag)).toEqual(['svg', 'path'])
    expect(pen.getAttribute('aria-pressed')).toBe('true')
  })

  it('uses the shortcuts configured in settings for toolbar tools', async () => {
    cacheShortcuts({
      overrides: { 'tool.frame': { key: 'x' } },
      custom: [],
    })
    const view = renderEditor(flexFixture())

    fireEvent.keyDown(window, { key: 'f' })
    expect(view.getByRole('button', { name: 'Frame' }).getAttribute('aria-pressed')).toBe('false')
    fireEvent.keyDown(window, { key: 'x' })
    expect(view.getByRole('button', { name: 'Frame' }).getAttribute('aria-pressed')).toBe('true')
    expect(applyTransaction).not.toHaveBeenCalled()
  })

  it('triggers toolbar tools through keyboard shortcuts (hand, pen, frame, etc.)', async () => {
    const view = renderEditor(flexFixture())
    const selectBtn = view.getByRole('button', { name: /Select/ })
    const handBtn = view.getByRole('button', { name: /Hand/ })

    expect(selectBtn.getAttribute('aria-pressed')).toBe('true')
    expect(handBtn.getAttribute('aria-pressed')).toBe('false')

    // Press 'h' -> switches to hand tool
    fireEvent.keyDown(window, { key: 'h' })
    expect(handBtn.getAttribute('aria-pressed')).toBe('true')
    expect(selectBtn.getAttribute('aria-pressed')).toBe('false')

    // Press 'v' -> switches back to select tool
    fireEvent.keyDown(window, { key: 'v' })
    expect(selectBtn.getAttribute('aria-pressed')).toBe('true')
    expect(handBtn.getAttribute('aria-pressed')).toBe('false')

    // Spacebar held down -> activates pan tool
    fireEvent.keyDown(window, { code: 'Space' })
    expect(handBtn.getAttribute('aria-pressed')).toBe('true')
    fireEvent.keyUp(window, { code: 'Space' })
    expect(handBtn.getAttribute('aria-pressed')).toBe('false')

    fireEvent.keyDown(window, { key: 'f' })
    expect(view.getByRole('button', { name: 'Frame' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.keyDown(window, { key: 'p' })
    expect(view.getByRole('button', { name: 'Pen' }).getAttribute('aria-pressed')).toBe('true')
    expect(applyTransaction).not.toHaveBeenCalled()
  })
})
