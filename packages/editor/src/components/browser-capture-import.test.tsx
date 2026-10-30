import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BrowserCaptureImport } from './browser-capture-import'

async function choose(file: { size: number; text: () => Promise<string> }) {
  fireEvent.click(screen.getByRole('button', { name: 'Import capture' }))
  const input = await screen.findByLabelText('Browser capture file')
  fireEvent.change(input, { target: { files: [file] } })
}

describe('browser capture file picker', () => {
  it('passes parsed captures to the editor', async () => {
    const onImport = vi.fn()
    render(<BrowserCaptureImport onImport={onImport} />)
    await choose({ size: 30, text: async () => '{"format":"sheet-browser-capture"}' })
    await waitFor(() => expect(onImport).toHaveBeenCalledWith({ format: 'sheet-browser-capture' }))
  })

  it('shows validation failures and keeps the chooser available', async () => {
    render(<BrowserCaptureImport onImport={() => { throw new Error('Unsupported capture version') }} />)
    await choose({ size: 2, text: async () => '{}' })
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Unsupported capture version')
    expect(screen.getByRole('button', { name: 'Choose capture file' }).hasAttribute('disabled')).toBe(false)
  })

  it('clears a previous failure when the dialog is closed', async () => {
    render(<BrowserCaptureImport onImport={() => { throw new Error('Unsupported capture version') }} />)
    await choose({ size: 2, text: async () => '{}' })
    await screen.findByRole('alert')
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Import capture' }))
    await screen.findByLabelText('Browser capture file')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('refuses large files without reading them', async () => {
    const onImport = vi.fn()
    const text = vi.fn()
    render(<BrowserCaptureImport onImport={onImport} />)
    await choose({ size: 20_000_001, text })
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Capture exceeds 20 MB. Select a smaller section.')
    expect(text).not.toHaveBeenCalled()
    expect(onImport).not.toHaveBeenCalled()
  })
})
