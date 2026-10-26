import { describe, expect, test } from 'vitest'
import { compileWebCodeHtml, compileWebStandaloneHtml } from './web-export'
import { applyWebTransaction, createWebDocument } from './web-model'
import { listPages, nextRootOrder, pageNode, stageColor } from './web-pages'

function apply(document: ReturnType<typeof createWebDocument>, operations: Parameters<typeof applyWebTransaction>[1]['operations']) {
  return applyWebTransaction(document, { id: `tx-${Math.random()}`, label: 'test', operations })
}

describe('page name and stage colour', () => {
  test('Page 1 is renamed through the document, and undo restores it', () => {
    const base = createWebDocument('t')
    const renamed = apply(base, [{ type: 'page.setName', name: 'Landing' }])
    expect(listPages(renamed.document)[0]).toEqual({ id: null, name: 'Landing' })

    const undone = applyWebTransaction(renamed.document, renamed.inverse)
    expect(listPages(undone.document)[0]).toEqual({ id: null, name: 'Page 1' })
    expect(undone.document.metadata.pageOneName).toBeUndefined()
  })

  test('the stage colour is set per page, validated, and undoable', () => {
    const base = createWebDocument('t')
    const page = pageNode('Open', { order: nextRootOrder(base), open: true })
    const withPage = apply(base, [{ type: 'node.insert', node: page }]).document

    const colored = apply(withPage, [
      { type: 'page.setStage', pageId: null, color: '#272727' },
      { type: 'page.setStage', pageId: page.id, color: '#112233' },
    ])
    expect(stageColor(colored.document, null)).toBe('#272727')
    expect(stageColor(colored.document, page.id)).toBe('#112233')

    const undone = applyWebTransaction(colored.document, colored.inverse)
    expect(stageColor(undone.document, null)).toBeNull()
    expect(stageColor(undone.document, page.id)).toBeNull()
    expect(undone.document.metadata.stageColors).toBeUndefined()

    expect(() => apply(withPage, [{ type: 'page.setStage', pageId: null, color: 'red' }])).toThrow()
    expect(() => apply(withPage, [{ type: 'page.setStage', pageId: 'missing', color: '#112233' }])).toThrow()
    expect(() => apply(withPage, [{ type: 'page.setName', name: '   ' }])).toThrow()
  })

  test('an export and a capture carry the stage colour, and only when one is set', () => {
    const base = createWebDocument('t')
    const page = pageNode('Open', { order: nextRootOrder(base), open: true })
    const bounded = pageNode('Board', { order: nextRootOrder(base) + 1_024 })
    const plain = apply(base, [
      { type: 'node.insert', node: page },
      { type: 'node.insert', node: bounded },
    ]).document
    expect(compileWebCodeHtml(plain)).not.toContain('body{background:#')
    expect(compileWebStandaloneHtml(plain)).not.toContain('!important')

    const colored = apply(plain, [
      { type: 'page.setStage', pageId: null, color: '#272727' },
      { type: 'page.setStage', pageId: page.id, color: '#112233' },
      { type: 'page.setStage', pageId: bounded.id, color: '#445566' },
    ]).document

    expect(compileWebCodeHtml(colored)).toContain('body{background:#272727}')
    const capture = compileWebStandaloneHtml(colored)
    expect(capture).toContain('[data-sheet-export-root]{background:#272727}')
    // An open page is painted in a capture; a bounded page keeps its own background.
    expect(capture).toContain(`[data-sheet-node="${page.id}"]{background:#112233!important}`)
    expect(capture).not.toContain('#445566')
  })
})
