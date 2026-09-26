/* eslint-disable no-mistakes/vitest-mock-test-file-naming -- This pure catalog-renderer test uses the DB/Valkey-free project selected by the .no-data.mock suffix. */
import type { Tool, ToolMeta } from '@voucha/tools/types'
import { describe, expect, it } from 'vitest'
import {
  buildClientManifest,
  renderCatalogTable,
  spliceCatalogTable,
} from './agent-tool-catalog.mts'

function fixtureTool(name: string, description: string | null, meta?: Partial<ToolMeta>): Tool {
  return {
    schema: { name, type: 'function', description, parameters: null, strict: null },
    function: (_user: unknown) => () => ({}),
    ...(meta ? { meta: { surfaces: ['internal'], api: null, ...meta } } : {}),
  } as unknown as Tool
}

describe('renderCatalogTable', () => {
  it('renders every tool with titles, escaped descriptions, plans, deduplicated scopes and hints', () => {
    const table = renderCatalogTable([
      fixtureTool('piped', 'Compare a | b\n  side by side', {
        surfaces: ['internal', 'mcp'],
        title: 'Piped',
        requiredScopes: { mcp: ['topics:read', 'posts:read'], admin_mcp: ['topics:read'] },
        annotations: { readOnlyHint: true },
      }),
      fixtureTool('mutating', 'mutating description', {
        surfaces: ['client'],
        title: 'Mutating',
        requiredScopes: { mcp: undefined },
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
        api: [
          { method: 'POST', path: '/api/v1/cards' },
          { method: 'DELETE', path: '/api/v1/cards/:id' },
        ],
      }),
      fixtureTool('upsert', 'upsert description', {
        title: 'Upsert',
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      }),
      fixtureTool('bare', null),
    ])

    expect(table).toBe(
      [
        '| Tool | Title | Description | Surfaces | Plan | Required scopes | Hints | REST Equivalent |',
        '| ---- | ----- | ----------- | -------- | ---- | --------------- | ----- | --------------- |',
        '| `piped` | Piped | Compare a \\| b side by side | internal, mcp | free | topics:read, posts:read | read-only | — |',
        '| `mutating` | Mutating | mutating description | client | — | — | write, destructive | `POST /api/v1/cards`, `DELETE /api/v1/cards/:id` |',
        '| `upsert` | Upsert | upsert description | internal | — | — | write, idempotent | — |',
        '| `bare` | — | — | internal | — | — | — | — |',
      ].join('\n'),
    )
  })
})

describe('spliceCatalogTable', () => {
  it('replaces only the generated block', () => {
    const markdown = '# Catalog\n\n<!-- BEGIN GENERATED -->\nold\n<!-- END GENERATED -->\n'

    expect(spliceCatalogTable(markdown, '| new |')).toBe(
      '# Catalog\n\n<!-- BEGIN GENERATED -->\n\n| new |\n\n<!-- END GENERATED -->\n',
    )
  })

  it.each([
    ['BEGIN', '# Catalog\n<!-- END GENERATED -->\n'],
    ['END', '# Catalog\n<!-- BEGIN GENERATED -->\n'],
  ])('throws when the %s marker is missing', (_marker, markdown) => {
    expect(() => spliceCatalogTable(markdown, '| new |')).toThrow(
      'The agent tool catalog is missing <!-- BEGIN GENERATED --> / <!-- END GENERATED --> markers',
    )
  })
})

describe('buildClientManifest', () => {
  it('lists client-surface tools with their declared scopes and REST equivalents', () => {
    const tools = [
      fixtureTool('user_read', 'user_read description', {
        surfaces: ['mcp', 'client'],
        requiredScopes: { mcp: ['topics:read'] },
        api: [{ method: 'GET', path: '/api/v1/topics/:id' }],
      }),
      fixtureTool('mcp_only', 'mcp_only description', { surfaces: ['mcp'] }),
      fixtureTool('client_only', null, { surfaces: ['client'] }),
    ]

    expect(buildClientManifest(tools)).toEqual({
      tools: [
        {
          name: 'user_read',
          description: 'user_read description',
          parameters: null,
          api: [{ method: 'GET', path: '/api/v1/topics/:id' }],
          requiredScopes: ['topics:read'],
        },
        { name: 'client_only', description: null, parameters: null, api: null, requiredScopes: [] },
      ],
    })
  })
})
