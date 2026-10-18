/* eslint-disable no-mistakes/vitest-mock-test-file-naming -- This pure catalog-builder test uses the DB/Valkey-free project selected by the .no-data.mock suffix. */
import type { Tool, ToolMeta } from '@services/openai-agents/tool-types'
import { describe, expect, it } from 'vitest'
import { buildMcpCatalog } from './build-mcp-catalog.mts'

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
    ...(meta ? { meta: { api: null, ...meta } } : {}),
  } as unknown as Tool
}

const TOPICS_SCHEMA = { type: 'object', properties: { query: { type: 'string' } } }
const WRITE_HINTS = { readOnlyHint: false, destructiveHint: true, idempotentHint: false } as const
const tools: Tool[] = [
  fixtureTool({
    name: 'user_read',
    parameters: TOPICS_SCHEMA,
    meta: {
      audience: 'user',
      title: 'User Read',
      outputSchema: { type: 'object' },
      requiredScopes: ['topics:read'],
      annotations: { readOnlyHint: true },
      api: [{ method: 'GET', path: '/api/v1/topics/:id' }],
    },
  }),
  fixtureTool({
    name: 'user_write',
    roles: { user: true },
    meta: {
      audience: 'user',
      title: 'User Write',
      plan: 'plus',
      requiredScopes: ['spending:write'],
      annotations: WRITE_HINTS,
    },
  }),
  fixtureTool({
    name: 'community_read',
    meta: {
      audience: 'community_moderation',
      title: 'Community Read',
      plan: 'plus',
      requiredScopes: ['community-moderation:read'],
      annotations: { readOnlyHint: true },
    },
  }),
  fixtureTool({
    name: 'staff_read',
    roles: { moderator: true, administrator: true, user: false },
    meta: {
      audience: 'admin',
      title: 'Staff Read',
      requiredScopes: ['moderation:read'],
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
  }),
  fixtureTool({
    name: 'legal_read',
    roles: { administrator: true, user: false },
    meta: {
      audience: 'legal',
      title: 'Legal Read',
      requiredScopes: ['copyright-notices:read'],
      annotations: { readOnlyHint: true },
    },
  }),
  fixtureTool({ name: 'internal_only', meta: { requiredScopes: ['topics:read'] } }),
  fixtureTool({
    name: 'curried',
    curried: true,
    meta: { audience: 'user', requiredScopes: ['topics:read'] },
  }),
  fixtureTool({ name: 'unscoped', meta: { audience: 'user' } }),
  fixtureTool({
    name: 'wrong_audience',
    meta: { audience: 'user', requiredScopes: ['moderation:read'] },
  }),
]

describe('buildMcpCatalog', () => {
  it('lists eligible scoped tools by audience and emits the unmounted brand row empty', () => {
    const catalog = buildMcpCatalog(tools)

    expect(
      catalog.servers.map(server => [server.audience, server.tools.map(({ tool }) => tool.name)]),
    ).toEqual([
      ['user', ['user_read', 'user_write']],
      ['community_moderation', ['community_read']],
      ['brand', []],
      ['admin', ['staff_read']],
      ['legal', ['legal_read']],
    ])
    expect(catalog.servers[0]?.tools[0]).toMatchObject({
      plan: 'free',
      roles: null,
      api: [{ method: 'GET', path: '/api/v1/topics/:id' }],
      tool: {
        title: 'User Read',
        outputSchema: { type: 'object' },
        _meta: { 'voucha/requiredScopes': ['topics:read'] },
      },
    })
    expect(catalog.servers[0]?.tools[1]).toMatchObject({ plan: 'plus', roles: null })
    expect(catalog.servers[1]?.tools[0]).toMatchObject({ plan: 'plus' })
    expect(catalog.servers[3]?.tools[0]).toMatchObject({ roles: ['administrator', 'moderator'] })
    expect(catalog.servers[3]?.tools[0]).not.toHaveProperty('plan')
    expect(catalog.servers[4]?.tools[0]).not.toHaveProperty('plan')
  })
})
