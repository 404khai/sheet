import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, vi, test } from 'vitest'
import { assertWebDocument, createWebDocument, createWebElement } from '@sheet/canvas/web-model'

const list = vi.fn()
const archive = vi.fn()
const deleteDesign = vi.fn()
const createWeb = vi.fn()
const renameWeb = vi.fn()
const getWebCanvas = vi.fn()

vi.doMock('@sheet/rpc/client', () => ({
  orpc: {
    design: { list, archive, delete: deleteDesign },
    webCanvas: { create: createWeb, get: getWebCanvas, rename: renameWeb },
    preferences: { get: vi.fn(async () => ({ shortcuts: null })), save: vi.fn() },
  },
}))

const navigate = vi.fn()
const routerModule = await import('@tanstack/react-router')
vi.doMock('@tanstack/react-router', () => ({
  ...routerModule,
  useNavigate: () => navigate,
  Link: ({
    to,
    params,
    children,
    ...props
  }: {
    to: string
    params?: Record<string, string>
    children?: ReactNode
  }) => {
    const path = Object.entries(params ?? {}).reduce(
      (current, [key, value]) => current.replace(`$${key}`, encodeURIComponent(value)),
      to,
    )
    return (
      <a href={path} {...props}>
        {children}
      </a>
    )
  },
}))

const { Home } = await import('./home')
const { CommandMenuProvider } = await import('./command-menu')

const HOUR = 3_600_000

/**
 * Radix opens a menu on pointerdown, and reaches for pointer-capture and
 * scroll APIs jsdom does not ship.
 */
function openMenu(name: string) {
  const element = Element.prototype as unknown as Record<string, unknown>
  element.hasPointerCapture ??= () => false
  element.setPointerCapture ??= () => {}
  element.releasePointerCapture ??= () => {}
  element.scrollIntoView ??= () => {}
  fireEvent.pointerDown(screen.getByRole('button', { name }), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  })
}

describe('Home', () => {
  beforeEach(() => {
    window.localStorage.clear()
    navigate.mockReset().mockResolvedValue(undefined)
    createWeb.mockReset().mockResolvedValue({ revision: 0 })
    getWebCanvas.mockReset().mockResolvedValue({ status: 'empty' })
    renameWeb.mockReset().mockResolvedValue({ revision: 2 })
    deleteDesign.mockReset().mockResolvedValue({ deleted: true })
    archive.mockReset().mockResolvedValue({ archivedAt: Date.now() })
    list.mockReset().mockResolvedValue([
      { id: 'design-old', name: 'Portfolio Design', revision: 3, updatedAt: Date.now() - 48 * HOUR },
      { id: 'design-new', name: 'Ideal pine', revision: 7, updatedAt: Date.now() - 2 * HOUR },
    ])
  })

  afterEach(() => cleanup())

  test('lists files most recently edited first and links each to its canvas', async () => {
    render(<Home />)

    await screen.findByText('Ideal pine')
    const links = screen.getAllByRole('link', { name: /^Open / })
    expect(links.map((link) => link.getAttribute('aria-label'))).toEqual([
      'Open Ideal pine',
      'Open Portfolio Design',
    ])
    expect(links[0]?.getAttribute('href')).toBe('/design/design-new')
    expect(screen.getByText('Edited 2 hours ago')).toBeTruthy()
  })

  test('sorts by name when asked, and remembers the choice', async () => {
    window.localStorage.setItem('sheet:files-sort', 'name')
    render(<Home />)

    await screen.findByText('Ideal pine')
    const links = screen.getAllByRole('link', { name: /^Open / })
    expect(links.map((link) => link.getAttribute('aria-label'))).toEqual([
      'Open Ideal pine',
      'Open Portfolio Design',
    ])
    list.mockResolvedValue([
      { id: 'b', name: 'Beta', revision: 1, updatedAt: Date.now() },
      { id: 'a', name: 'Alpha', revision: 1, updatedAt: Date.now() - HOUR },
    ])
    cleanup()
    render(<Home />)
    await screen.findByText('Alpha')
    expect(screen.getAllByRole('link', { name: /^Open / })[0]?.getAttribute('aria-label')).toBe('Open Alpha')
  })

  test('shows the last three files to continue once there are more than three', async () => {
    list.mockResolvedValue(
      ['One', 'Two', 'Three', 'Four'].map((name, index) => ({
        id: `d-${index}`,
        name,
        revision: 1,
        updatedAt: Date.now() - index * HOUR,
      })),
    )
    render(<Home />)

    const continueSection = (await screen.findByRole('heading', { name: 'Continue' })).closest('section')
    expect(continueSection).toBeTruthy()
    if (!continueSection) return
    expect(
      within(continueSection).getAllByRole('link', { name: /^Open / }).map((link) => link.getAttribute('aria-label')),
    ).toEqual(['Open One', 'Open Two', 'Open Three'])
  })

  test('renders the fetched web document inside its thumbnail', async () => {
    const document = createWebDocument('Preview', 'preview')
    document.nodes.root = createWebElement('main', {
      id: 'root', order: 1_024, styles: { background: '#123456', width: '800px', height: '600px' },
    })
    document.roots = ['root']
    getWebCanvas.mockResolvedValue({ status: 'ready', document: assertWebDocument(document) })
    list.mockResolvedValue([{ id: 'thumbnail-fixture', name: 'Thumbnail', revision: 1, updatedAt: Date.now() }])
    const view = render(<Home />)
    await waitFor(() => expect(view.container.querySelectorAll('[data-sheet-node="root"]')).toHaveLength(1))
    expect(view.container.querySelector('[data-sheet-node="root"]')?.getAttribute('style')).toContain('background: rgb(18, 52, 86)')
  })

  test('finds a file by name through the command menu', async () => {
    render(
      <CommandMenuProvider>
        <Home />
      </CommandMenuProvider>,
    )
    await screen.findByText('Ideal pine')

    fireEvent.click(screen.getByRole('button', { name: 'Search files or run a command' }))
    fireEvent.change(await screen.findByLabelText('Search files and actions'), {
      target: { value: 'portfolio' },
    })

    await waitFor(() => {
      const names = screen.getAllByRole('option').map((option) => option.textContent ?? '')
      expect(names.some((name) => name.includes('Portfolio Design'))).toBe(true)
      expect(names.some((name) => name.includes('Ideal pine'))).toBe(false)
    })
  })

  test('opens the new file on the canvas route after creating it', async () => {
    render(<Home />)
    await screen.findByText('Ideal pine')

    fireEvent.click(screen.getByRole('button', { name: 'New file' }))

    await waitFor(() => expect(createWeb).toHaveBeenCalledTimes(1))
    const created = createWeb.mock.calls[0]?.[0] as { designId: string; name: string }
    expect(created.name).toBe('Untitled')
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: '/design/$id',
        params: { id: created.designId },
      }),
    )
  })

  test('offers both ways in when there are no files', async () => {
    list.mockResolvedValue([])
    render(<Home />)

    expect(await screen.findByText('Design with your agent, or by hand')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'New file' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Connect an agent' })).toBeTruthy()
  })

  test('surfaces a failed load without leaving the placeholders up', async () => {
    list.mockRejectedValue(new Error('offline'))
    render(<Home />)

    expect(await screen.findByText(/offline/)).toBeTruthy()
    expect(document.querySelector('[aria-busy="true"]')).toBeNull()
  })

  test('confirms deletion and moves the file to the archive', async () => {
    render(<Home />)
    await screen.findByText('Ideal pine')

    openMenu('Actions for Ideal pine')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))

    expect(await screen.findByText('Delete “Ideal pine”?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(archive).toHaveBeenCalledWith({ id: 'design-new' }))
    expect(deleteDesign).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByText('Ideal pine')).toBeNull())
    expect(screen.getByText('Portfolio Design')).toBeTruthy()
  })

  test('renames a file in place and keeps the old name when the server refuses', async () => {
    renameWeb.mockRejectedValue(new Error('disk full'))
    render(<Home />)
    await screen.findByText('Ideal pine')

    openMenu('Actions for Ideal pine')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }))
    const field = await screen.findByLabelText('File name')
    fireEvent.change(field, { target: { value: 'Pine v2' } })
    fireEvent.keyDown(field, { key: 'Enter' })

    await waitFor(() => expect(renameWeb).toHaveBeenCalledWith({ designId: 'design-new', name: 'Pine v2' }))
    expect(await screen.findByText('Ideal pine')).toBeTruthy()
    expect(screen.queryByText('Pine v2')).toBeNull()
  })

  test('displays scratchpad with permanent draft subtitle', async () => {
    list.mockResolvedValue([
      { id: 'design-scratch', name: 'Scratchpad', revision: 1, updatedAt: Date.now() - HOUR },
    ])
    render(<Home />)

    expect(await screen.findByText('Scratchpad')).toBeTruthy()
    expect(screen.getByText('Your permanent draft')).toBeTruthy()
  })

  test('switches between grid and list views', async () => {
    render(<Home />)
    await screen.findByText('Ideal pine')

    const listOption = screen.getByRole('radio', { name: 'List view' })
    fireEvent.click(listOption)
    expect(listOption.getAttribute('aria-checked')).toBe('true')
    expect(window.localStorage.getItem('sheet:files-view')).toBe('list')

    const gridOption = screen.getByRole('radio', { name: 'Grid view' })
    fireEvent.click(gridOption)
    expect(gridOption.getAttribute('aria-checked')).toBe('true')
  })
})
