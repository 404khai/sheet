import { describe, expect, test } from 'vitest'
import {
  advertisedTools,
  containsTupleItems,
  normalizeJsonArguments,
  schemaPointer,
  toolNames,
  validationSchemas,
  type JsonValue,
} from './tools'

describe('MCP tool manifest', () => {
  test('embeds the complete TypeScript tool manifest', () => {
    const names = toolNames()
    expect(names).toHaveLength(32)
    expect(names[0]).toBe('getUsage')
    expect(names).not.toContain('getScreenshot')
    expect(names).not.toContain('patchNodes')
    expect(names).not.toContain('insertNodes')
    expect(names).toContain('getWebDocument')
    expect(names).toContain('getWebHTML')
    expect(names).toContain('getWebCSS')
    expect(names).toContain('getWebScreenshot')
    expect(names).toContain('searchIcons')
    expect(names).toContain('insertIcon')
    expect(names).toContain('styleIcon')
    expect(names).toContain('listPages')
    expect(names).toContain('createPage')
    expect(names).toContain('listFramePresets')
    expect(names).toContain('createFrame')
    expect(names).toContain('listShaders')
    expect(names).toContain('insertShader')
    expect(names).toContain('styleShader')
    expect(names).toContain('applyWebTransaction')
    expect(names).toContain('createBranch')
    expect(names).toContain('applyBranch')
    expect(names).toContain('listComments')
    expect(names).toContain('resolveComment')
    expect(names.at(-1)).toBe('listAssets')
    for (const name of validationSchemas.keys()) {
      expect(names).toContain(name)
    }
  })

  test('advertises Codex-compatible arrays without weakening validation schemas', () => {
    expect(containsTupleItems(advertisedTools as unknown as JsonValue)).toBe(
      false,
    )
    expect(validationSchemas.get('applyWebTransaction')).toBeDefined()
    expect(
      schemaPointer(
        validationSchemas.get('applyWebTransaction') as JsonValue,
        '/properties/transaction/properties/operations',
      ),
    ).toBeDefined()
  })

  test('decodes structured arguments sent as JSON text', () => {
    const args: JsonValue = {
      designId: 'd1',
      nodes: '[{"type":"text","text":"Hello"}]',
      query: '[literal text]',
    }
    normalizeJsonArguments(args)
    expect(Array.isArray((args as { nodes: unknown }).nodes)).toBe(true)
    expect((args as { query: unknown }).query).toBe('[literal text]')
  })
})
