import { describe, expect, it } from 'vitest'
import { db, ensureLocalUser, LOCAL_USER_ID } from '@sheet/db'
import { design, designVersion } from '@sheet/db/schema'
import { and, eq } from 'drizzle-orm'
import {
  assertWebDocument,
  createWebDocument,
  createWebElement,
  createWebStyleRule,
  createWebStyleSheet,
  createWebText,
  serializeWebDocument,
  WEB_CANVAS_STORAGE_VERSION,
  type WebDocument,
} from '@sheet/canvas/web-model'
import { serializeWebStylesheets } from '@sheet/canvas/web-css'
import { compileWebStandaloneHtml } from '@sheet/canvas/web-export'
import { completeCapture, NO_WINDOW_MESSAGE, registerCapturer, type CaptureRequest } from './capture-broker'
import { createSheetToolExecutor } from './mcp-server'
import type { McpUsageController } from './mcp-server'

/**
 * M8b-2 proof: screenshots render the same serialized HTML/CSS the editor
 * materializes — no second rendering implementation — and never mutate
 * revisions, history, or the document.
 */

/** A stand-in for the app window: answers every capture with a fixed image and records the requests. */
function fakeWindow() {
  const requests: CaptureRequest[] = []
  const bytes = new Uint8Array(2_000).fill(7)
  const unregister = registerCapturer({
    send: (request) => {
      requests.push(request)
      queueMicrotask(() =>
        completeCapture(request.id, { ok: true, bytes, mimeType: 'image/png', width: request.width, height: 600 }),
      )
    },
  })
  return { requests, unregister }
}

function shotFixture() {
  const document = createWebDocument('Shot', 'shot')
  document.nodes.card = createWebElement('div', {
    id: 'card',
    order: 1_024,
    attributes: { class: 'card' },
    styles: { width: '400px', padding: '20px', background: '#18181b' },
  })
  document.nodes.title = createWebElement('h1', {
    id: 'title',
    parentId: 'card',
    order: 1_024,
    attributes: { class: 'title' },
  })
  document.nodes.titleText = createWebText('Shot', { id: 'titleText', parentId: 'title', order: 1_024 })
  document.roots = ['card']
  document.stylesheets.main = createWebStyleSheet('main', { id: 'main', order: 1_024 })
  document.stylesheets.main.rules.base = createWebStyleRule(
    '.card',
    { display: 'grid', gap: '12px' },
    { id: 'base', order: 1_024 },
  )
  document.stylesheets.main.rules.title = createWebStyleRule(
    '.title',
    { color: 'rgb(255, 255, 255)', 'font-size': '32px' },
    { id: 'title', order: 2_048 },
  )
  document.stylesheets.main.ruleOrder = ['base', 'title']
  document.stylesheetOrder = ['main']
  return assertWebDocument(document)
}

function usage(): McpUsageController {
  const snapshot = {
    metric: 'mcp_tool_calls' as const,
    plan: 'free' as const,
    included: 200,
    used: 0,
    remaining: 200,
    periodStart: '2026-07-27T00:00:00.000Z',
    resetsAt: '2026-08-03T00:00:00.000Z',
  }
  return {
    current: async () => snapshot,
    reserve: async () => snapshot,
  }
}

async function seedDesign(document: WebDocument) {
  await ensureLocalUser()
  const id = `web-shot-${crypto.randomUUID()}`
  await db.insert(design).values({
    id,
    userId: LOCAL_USER_ID,
    name: document.name,
    shapes: [],
    pages: [],
    canvasVersion: WEB_CANVAS_STORAGE_VERSION,
    canvasDocument: document,
    revision: 0,
  })
  return id
}

describe('web screenshots', () => {
  it('compiles the exact materialization serialization, not a parallel renderer', () => {
    const document = shotFixture()
    const html = compileWebStandaloneHtml(document)
    // Same serializers the editor materializes from; the capture shell adds
    // only identity hooks for subtree addressing plus a margin reset.
    expect(html).toContain(serializeWebDocument(document, { includeNodeIds: true }))
    expect(html).toContain(serializeWebStylesheets(document.stylesheets, document.stylesheetOrder))
    expect(html).toContain('data-sheet-export-root="true"')
    expect(html).toContain('data-sheet-node="title"')
    expect(html).toContain('<title>Shot</title>')
    // Portable HTML stays clean: no identity hooks unless asked for.
    expect(serializeWebDocument(document)).not.toContain('data-sheet-node')
  })

  it('renders through the app window without touching revisions, history, or the document', async () => {
    const document = shotFixture()
    const designId = await seedDesign(document)
    const before = JSON.stringify(document)
    const versionsBefore = await db
      .select({ id: designVersion.id })
      .from(designVersion)
      .where(and(eq(designVersion.designId, designId), eq(designVersion.userId, LOCAL_USER_ID)))

    const window = fakeWindow()
    try {
      const { renderWebScreenshot } = await import('@sheet/rpc/mcp-screenshot')
      const full = await renderWebScreenshot(LOCAL_USER_ID, document, { width: 800 })
      expect(full.png.byteLength).toBeGreaterThan(1_000)
      expect(full.width).toBe(800)
      expect(full.height).toBeGreaterThan(0)
      expect(full.rootId).toBeNull()
      expect(window.requests[0]?.html).toContain('data-sheet-export-root="true"')

      const scoped = await renderWebScreenshot(LOCAL_USER_ID, document, { rootId: 'title', width: 800 })
      expect(scoped.rootId).toBe('title')
      expect(window.requests[1]?.rootId).toBe('title')
      expect(scoped.width).toBeLessThanOrEqual(full.width)
      await expect(
        renderWebScreenshot(LOCAL_USER_ID, document, { rootId: 'missing' }),
      ).rejects.toThrow('does not exist')

      const stored = await db
        .select({ revision: design.revision, document: design.canvasDocument })
        .from(design)
        .where(and(eq(design.id, designId), eq(design.userId, LOCAL_USER_ID)))
        .limit(1)
        .then((rows) => rows[0])
      expect(stored?.revision).toBe(0)
      expect(JSON.stringify(stored?.document)).toBe(before)
      const versionsAfter = await db
        .select({ id: designVersion.id })
        .from(designVersion)
        .where(and(eq(designVersion.designId, designId), eq(designVersion.userId, LOCAL_USER_ID)))
      expect(versionsAfter).toEqual(versionsBefore)
    } finally {
      window.unregister()
    }
  }, 60_000)

  it('exposes the render through the MCP envelope with revision metadata', async () => {
    const designId = await seedDesign(shotFixture())
    const execute = createSheetToolExecutor(LOCAL_USER_ID, usage())
    const window = fakeWindow()
    try {
      const result = await execute('getWebScreenshot', { designId, width: 800 }) as {
        isError?: boolean
        content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>
      }
      expect(result.isError).not.toBe(true)
      const metadata = JSON.parse(result.content[0]?.text ?? '{}') as Record<string, unknown>
      expect(metadata).toMatchObject({
        mimeType: 'image/png',
        width: 800,
        revision: 0,
        target: { designId, draftId: null, rootId: null },
      })
      const image = result.content[1]
      expect(image?.type).toBe('image')
      expect(image?.mimeType).toBe('image/png')
      expect((image?.data ?? '').length).toBeGreaterThan(1_000)
    } finally {
      window.unregister()
    }
  }, 60_000)

  it('says so plainly when no Sheet window is open', async () => {
    const { renderWebScreenshot } = await import('@sheet/rpc/mcp-screenshot')
    await expect(renderWebScreenshot(LOCAL_USER_ID, shotFixture(), {})).rejects.toThrow(NO_WINDOW_MESSAGE)
  })
})
