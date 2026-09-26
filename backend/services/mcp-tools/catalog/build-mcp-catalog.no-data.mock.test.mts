/* eslint-disable no-mistakes/vitest-mock-test-file-naming -- This pure catalog-builder test uses the DB/Valkey-free project selected by the .no-data.mock suffix. */
import type { Tool, ToolMeta } from '@voucha/tools/types'
import { describe, expect, it } from 'vitest'
import { buildMcpCatalog, findMissingApiOperations } from './build-mcp-catalog.mts'

type ToolFixture = {
  name: string
  description?: string | null
  curried?: boolean
  roles?: Tool['roles']
  meta?: Partial<ToolMeta>
  parameters?: Record<string, unknown> | null
}

function fixtureTool({
  name,
  description = `${name} description`,
  curried = false,
  roles,
  meta,
  parameters = null,
}: ToolFixture): Tool {
  return {
    schema: { name, type: 'function', description, parameters, strict: null },
    function: curried
      ? (_user: unknown, _extra: unknown) => () => ({})
      : (_user: unknown) => () => ({}),
    ...(roles ? { roles } : {}),
    ...(meta ? { meta: { surfaces: ['internal'], api: null, ...meta } } : {}),
  } as unknown as Tool
}

const TOPICS_SCHEMA = { type: 'object', properties: { query: { type: 'string' } } }
const WRITE_HINTS = { readOnlyHint: false, destructiveHint: true, idempotentHint: false } as const
const userRead = fixtureTool({
  name: 'user_read',
  parameters: TOPICS_SCHEMA,
  meta: {
    surfaces: ['mcp', 'client'],
    title: 'User Read',
    requiredScopes: { mcp: ['topics:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/topics/:id' }],
  },
})
const userWrite = fixtureTool({
  name: 'user_write',
  roles: { user: true },
  meta: {
    surfaces: ['mcp'],
    title: 'User Write',
    plan: 'plus',
    requiredScopes: { mcp: ['spending:write'] },
    annotations: WRITE_HINTS,
  },
})
const staffRead = fixtureTool({
  name: 'staff_read',
  roles: { moderator: true, administrator: true, user: false },
  meta: {
    surfaces: ['internal', 'admin_mcp'],
    title: 'Staff Read',
    requiredScopes: { admin_mcp: ['mcp.admin:read'] },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
})
const ineligible = [
  fixtureTool({ name: 'no_meta' }),
  fixtureTool({ name: 'internal_only', meta: { requiredScopes: { mcp: ['topics:read'] } } }),
  fixtureTool({
    name: 'curried',
    curried: true,
    meta: { surfaces: ['mcp'], requiredScopes: { mcp: ['topics:read'] } },
  }),
  fixtureTool({ name: 'unscoped', meta: { surfaces: ['mcp'] } }),
  fixtureTool({
    name: 'wrong_audience',
    meta: { surfaces: ['mcp', 'admin_mcp'], requiredScopes: { mcp: ['mcp.admin:read'] } },
  }),
]

describe('buildMcpCatalog', () => {
  it('lists each eligible, scoped tool on its server with plan, role and REST metadata', () => {
    const catalog = buildMcpCatalog([...ineligible, userRead, userWrite, staffRead])

    expect(catalog).toEqual({
      servers: [
        {
          name: 'voucha-user-mcp',
          path: '/api/v1/mcp',
          surface: 'mcp',
          tools: [
            {
              tool: {
                name: 'user_read',
                title: 'User Read',
                description: 'user_read description',
                inputSchema: TOPICS_SCHEMA,
                annotations: { readOnlyHint: true, idempotentHint: true },
                _meta: { 'voucha/requiredScopes': ['topics:read'] },
              },
              plan: 'free',
              roles: null,
              api: [{ method: 'GET', path: '/api/v1/topics/:id' }],
            },
            {
              tool: {
                name: 'user_write',
                title: 'User Write',
                description: 'user_write description',
                inputSchema: { type: 'object', properties: {} },
                annotations: WRITE_HINTS,
                _meta: { 'voucha/requiredScopes': ['spending:write'] },
              },
              plan: 'plus',
              roles: null,
              api: null,
            },
          ],
        },
        {
          name: 'voucha-admin-mcp',
          path: '/api/v1/admin/mcp',
          surface: 'admin_mcp',
          tools: [
            {
              tool: {
                name: 'staff_read',
                title: 'Staff Read',
                description: 'staff_read description',
                inputSchema: { type: 'object', properties: {} },
                annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
                _meta: { 'voucha/requiredScopes': ['mcp.admin:read'] },
              },
              roles: ['administrator', 'moderator'],
              api: null,
            },
          ],
        },
      ],
    })
    expect(catalog.servers[1]?.tools[0]).not.toHaveProperty('plan')
  })
})

describe('findMissingApiOperations', () => {
  it('reports REST equivalents whose OpenAPI path or method does not exist', () => {
    const cards = fixtureTool({
      name: 'cards',
      meta: {
        api: [
          { method: 'POST', path: '/api/v1/cards' },
          { method: 'DELETE', path: '/api/v1/cards/:cardId' },
        ],
      },
    })
    const openapi = { paths: { '/api/v1/topics/{id}': { get: {} }, '/api/v1/cards': { get: {} } } }

    expect(
      findMissingApiOperations([userRead, cards, fixtureTool({ name: 'bare' })], openapi),
    ).toEqual([
      { tool: 'cards', method: 'POST', path: '/api/v1/cards' },
      { tool: 'cards', method: 'DELETE', path: '/api/v1/cards/:cardId' },
    ])
  })
})
