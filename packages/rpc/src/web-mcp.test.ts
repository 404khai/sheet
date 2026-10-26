import { describe, expect, it } from 'vitest'
import { db, ensureLocalUser, LOCAL_USER_ID } from '@sheet/db'
import { design } from '@sheet/db/schema'
import {
  applyWebTransaction,
  assertWebDocument,
  createWebDocument,
  createWebElement,
  createWebStyleRule,
  createWebStyleSheet,
  createWebText,
  materializeWebNode,
  materializeWebStylesheets,
  WEB_CANVAS_STORAGE_VERSION,
  type WebDocument,
} from '@sheet/canvas/web-model'
import { createSheetToolExecutor } from './mcp-server'
import type { McpUsageController } from './mcp-server'

/**
 * M6 proof: MCP is a transport over the same WebTransaction authority the
 * editor uses. Same validation, same inverses, same compare-and-swap,
 * same history, same realtime path — no MCP-specific mutation semantics,
 * no MCP-specific rendering semantics.
 */

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

function seedFixture() {
  const document = createWebDocument('MCP web', 'mcp-web')
  document.nodes.card = createWebElement('div', {
    id: 'card',
    order: 1_024,
    attributes: { class: 'card' },
    styles: { display: 'flex' },
  })
  document.nodes.one = createWebElement('div', {
    id: 'one',
    parentId: 'card',
    order: 1_024,
  })
  document.nodes.oneText = createWebText('One', { id: 'oneText', parentId: 'one', order: 1_024 })
  document.roots = ['card']
  document.stylesheets.main = createWebStyleSheet('main', { id: 'main', order: 1_024 })
  document.stylesheets.main.rules.base = createWebStyleRule(
    '.card',
    { gap: '16px' },
    { id: 'base', order: 1_024 },
  )
  document.stylesheets.main.ruleOrder = ['base']
  document.stylesheetOrder = ['main']
  return assertWebDocument(document)
}

async function seedDesign(document: WebDocument) {
  await ensureLocalUser()
  const id = `web-mcp-${crypto.randomUUID()}`
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

function textResult(result: unknown) {
  const content = (result as { content: Array<{ type: string; text: string }> }).content
  if (content[0]?.type !== 'text') throw new Error('Expected MCP text content')
  return JSON.parse(content[0].text) as Record<string, unknown>
}

function substance(document: WebDocument) {
  return {
    nodes: document.nodes,
    roots: document.roots,
    stylesheets: document.stylesheets,
    stylesheetOrder: document.stylesheetOrder,
    components: document.components,
    instances: document.instances,
  }
}

describe('MCP web transactions', () => {
  it('produces the same document as the editor transaction path', async () => {
    const designId = await seedDesign(seedFixture())
    const execute = createSheetToolExecutor(LOCAL_USER_ID, usage())
    const transaction = {
      id: 'mcp-gap',
      label: 'MCP set gap',
      operations: [{
        type: 'node.patch',
        id: 'card',
        patch: { kind: 'element', styles: { gap: '32px' } },
      }],
    }
    const expected = substance(
      applyWebTransaction(seedFixture(), {
        ...transaction,
        operations: transaction.operations as never,
      }).document,
    )
    const result = await execute('applyWebTransaction', {
      designId,
      expectedRevision: 0,
      transaction,
      // The tool returns only the summary unless the full document is asked for.
      verbose: true,
    })
    const body = textResult(result)
    expect(body).toMatchObject({ applied: true, revision: 1 })
    expect(substance(assertWebDocument(body.document))).toEqual(expected)

    const read = textResult(await execute('getWebDocument', { designId }))
    expect(read).toMatchObject({ status: 'ready', revision: 1 })
    expect(substance(assertWebDocument(read.document))).toEqual(expected)
  })

  it('rejects bound-node edits with the same contract error as the editor', async () => {
    let document = seedFixture()
    const button = createWebElement('button', {
      id: 'btn-template',
      parentId: null,
      order: 1_024,
      attributes: { class: 'btn' },
    })
    const labelText = createWebText('Label', {
      id: 'btn-label-text-template',
      parentId: 'btn-template',
      order: 1_024,
    })
    document = applyWebTransaction(document, {
      id: 'define',
      label: 'Define',
      operations: [{
        type: 'component.define',
        component: { id: 'button', name: 'Button', templateRootIds: ['btn-template'], stylesheetId: null },
        template: [button, labelText],
      }],
    }).document
    document = applyWebTransaction(document, {
      id: 'create',
      label: 'Create',
      operations: [{ type: 'instance.create', id: 'a', componentId: 'button', parentId: 'card', order: 2_048 }],
    }).document
    const designId = await seedDesign(document)
    const execute = createSheetToolExecutor(LOCAL_USER_ID, usage())
    const liveText = Object.entries(document.instances.a?.bindings ?? {}).find(
      ([, template]) => template === 'btn-label-text-template',
    )?.[0] as string

    const result = await execute('applyWebTransaction', {
      designId,
      expectedRevision: 0,
      transaction: {
        id: 'mcp-hack',
        label: 'MCP direct bound edit',
        operations: [{
          type: 'node.patch',
          id: liveText,
          patch: { kind: 'element', styles: { width: '10px' } },
        }],
      },
    }) as { isError?: boolean; content: Array<{ type: string; text: string }> }
    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toContain('bound instance node')
  })

  it('lets an agent resize the page root through the shared transaction tool', async () => {
    const designId = await seedDesign(seedFixture())
    const execute = createSheetToolExecutor(LOCAL_USER_ID, usage())
    const result = textResult(await execute('applyWebTransaction', {
      designId,
      expectedRevision: 0,
      // This assertion reads the document back, which needs the verbose reply.
      verbose: true,
      transaction: {
        id: 'resize-page',
        label: 'Resize page',
        operations: [{
          type: 'node.patch',
          id: 'card',
          patch: { kind: 'element', styles: { width: '1440px', height: '2400px' } },
        }],
      },
    }))
    const document = assertWebDocument(result.document)
    expect(document.nodes.card).toMatchObject({
      styles: { display: 'flex', width: '1440px', height: '2400px' },
    })
  })

  it('enforces compare-and-swap revisions exactly like editor saves', async () => {
    const designId = await seedDesign(seedFixture())
    const execute = createSheetToolExecutor(LOCAL_USER_ID, usage())
    const first = textResult(await execute('applyWebTransaction', {
      designId,
      expectedRevision: 0,
      transaction: {
        id: 'mcp-first',
        label: 'First',
        operations: [{ type: 'node.move', id: 'one', parentId: 'card', order: 2_048 }],
      },
    }))
    expect(first).toMatchObject({ applied: true, revision: 1 })
    const second = textResult(await execute('applyWebTransaction', {
      designId,
      expectedRevision: 0,
      transaction: {
        id: 'mcp-second',
        label: 'Second',
        operations: [{ type: 'node.move', id: 'one', parentId: 'card', order: 512 }],
      },
    }))
    expect(second).toMatchObject({ applied: false, reason: 'stale', revision: 1 })
  })

  it('reads authored HTML/CSS and materializes through the shared renderer path', async () => {
    const designId = await seedDesign(seedFixture())
    const execute = createSheetToolExecutor(LOCAL_USER_ID, usage())
    const html = textResult(await execute('getWebHTML', { designId }))
    expect(html.html).toContain('<div class="card"')
    const css = textResult(await execute('getWebCSS', { designId }))
    expect(css.css).toContain('.card{gap:16px}')

    // No MCP-specific rendering: the same materializers WebDocumentView
    // uses render the MCP-written document without knowing MCP touched it.
    const read = textResult(await execute('getWebDocument', { designId }))
    const document = assertWebDocument(read.document)
    const styles = materializeWebStylesheets(document, globalThis.document)
    expect(styles).toHaveLength(1)
    expect(styles[0]?.getAttribute('data-sheet-stylesheet')).toBe('main')
    const host = globalThis.document.createElement('div')
    for (const rootId of document.roots) host.append(materializeWebNode(document, rootId, globalThis.document))
    expect(host.querySelector('[data-sheet-node="card"]')?.tagName).toBe('DIV')
  })

  it('exposes nodes, rules, components, bindings, and overrides for discovery', async () => {
    const designId = await seedDesign(seedFixture())
    const execute = createSheetToolExecutor(LOCAL_USER_ID, usage())
    const read = textResult(await execute('getWebDocument', { designId }))
    const document = assertWebDocument(read.document)
    expect(Object.keys(document.nodes)).toEqual(expect.arrayContaining(['card', 'one', 'oneText']))
    expect(document.roots).toEqual(['card'])
    expect(document.stylesheets.main?.rules.base).toMatchObject({
      selector: '.card',
      declarations: { gap: '16px' },
    })
    expect(document.components).toEqual({})
    expect(document.instances).toEqual({})
    expect(read.revision).toBe(0)
  })
})
