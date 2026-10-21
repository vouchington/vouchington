import type { Tool, ToolMeta } from '@services/openai-agents/tool-types'
import { toolToMcpTool } from '@voucha/mcp/registry/adapters'
import { isToolMcpEligible, listToolsForAudience } from '@voucha/mcp/registry/select'
import { describe, expect, it } from 'vitest'
import type { McpServerConfig } from '../config.mts'
import { buildMcpCatalog } from './build-mcp-catalog.mts'
import { findCatalogContractViolations } from './check-catalog-contracts.mts'

type FixtureMeta = Partial<ToolMeta>

function fixtureTool(name: string, meta: FixtureMeta, roles?: Tool['roles']): Tool {
  return {
    schema: {
      name,
      type: 'function',
      description: `${name} description`,
      parameters: null,
      strict: null,
    },
    function: (_user: unknown) => () => ({}),
    ...(roles ? { roles } : {}),
    meta: {
      title: name,
      api: null,
      annotations: { readOnlyHint: true },
      outputSchema: { type: 'object', properties: {} },
      ...meta,
    },
  } as unknown as Tool
}

function fixtureRegistry(): Tool[] {
  return [
    fixtureTool('user_read', {
      audience: 'user',
      requiredScopes: ['topics:read'],
      api: [{ method: 'GET', path: '/api/v1/topics/:id' }],
    }),
    fixtureTool('community_read', {
      audience: 'community_moderation',
      plan: 'plus',
      requiredScopes: ['community-moderation:read'],
    }),
    fixtureTool(
      'admin_other',
      { audience: 'admin', requiredScopes: ['moderation:read'] },
      { administrator: true },
    ),
    fixtureTool(
      'legal_decision',
      {
        audience: 'legal',
        requiredScopes: ['copyright-notices:read'],
        switch: 'copyright.mcpDecisionTools',
      },
      { administrator: true },
    ),
    fixtureTool('internal_only', { requiredScopes: ['topics:read'] }),
  ]
}

function fixtureList(tools: readonly Tool[]) {
  return (_user: unknown, _scopes: unknown, config: McpServerConfig, copyrightEnabled: boolean) =>
    listToolsForAudience(config.audience, tools)
      .filter(tool => isToolMcpEligible(tool))
      .filter(tool => copyrightEnabled || tool.meta?.switch !== 'copyright.mcpDecisionTools')
      .map(tool => toolToMcpTool(tool, config.audience))
}

describe('MCP catalog contracts with a tiny registry', () => {
  it('builds all five audience catalogs, leaving brand empty in this tiny registry', () => {
    const catalog = buildMcpCatalog(fixtureRegistry())

    expect(catalog.servers.map(server => [server.audience, server.name, server.path])).toEqual([
      ['user', 'voucha-user-mcp', '/api/v1/mcp'],
      [
        'community_moderation',
        'voucha-community-moderation-mcp',
        '/api/v1/community-moderation/mcp',
      ],
      ['brand', 'voucha-brand-mcp', '/api/v1/brand/mcp'],
      ['admin', 'voucha-admin-mcp', '/api/v1/admin/mcp'],
      ['legal', 'voucha-legal-mcp', '/api/v1/legal/mcp'],
    ])
    expect(catalog.servers.map(server => server.tools.map(({ tool }) => tool.name))).toEqual([
      ['user_read'],
      ['community_read'],
      [],
      ['admin_other'],
      ['legal_decision'],
    ])
    expect(catalog.servers[0]?.tools[0]).toMatchObject({
      plan: 'free',
      roles: null,
      api: [{ method: 'GET', path: '/api/v1/topics/:id' }],
      tool: { title: 'user_read', outputSchema: { type: 'object' } },
    })
    expect(catalog.servers[1]?.tools[0]).toMatchObject({ plan: 'plus' })
    expect(catalog.servers[3]?.tools[0]).toMatchObject({ roles: ['administrator'] })
    expect(catalog.servers[3]?.tools[0]).not.toHaveProperty('plan')
    expect(catalog.servers[4]?.tools[0]).not.toHaveProperty('plan')
  })

  it('accepts a matching tools/list boundary and copyright switch on legal', () => {
    const tools = fixtureRegistry()
    expect(findCatalogContractViolations(tools, fixtureList(tools), 1)).toEqual([])
  })

  it('rejects a missing tools/list entry and a stale server catalog', () => {
    const tools = fixtureRegistry()
    const list = fixtureList(tools)
    const brokenList = (...args: Parameters<typeof list>) =>
      list(...args).filter(tool => tool.name !== 'user_read')
    expect(findCatalogContractViolations(tools, brokenList, 1)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('voucha-user-mcp tools/list differs'),
        expect.stringContaining('voucha-user-mcp catalog differs'),
      ]),
    )
  })

  it('rejects tools/list metadata drift even when every tool name still matches', () => {
    const tools = fixtureRegistry()
    const list = fixtureList(tools)
    const changedList = (...args: Parameters<typeof list>) =>
      list(...args).map(tool =>
        tool.name === 'user_read'
          ? {
              ...tool,
              description: 'changed description',
              title: 'Changed title',
              inputSchema: { type: 'object', properties: { changed: { type: 'string' } } },
            }
          : tool,
      )
    expect(findCatalogContractViolations(tools, changedList, 1)).toContain(
      'voucha-user-mcp catalog differs from tools/list',
    )
  })

  it('rejects copyright-count drift and a switch that retains a decision tool', () => {
    const tools = fixtureRegistry()
    const list = fixtureList(tools)
    const ignoredSwitch = (user: unknown, scopes: unknown, config: McpServerConfig) =>
      list(user, scopes, config, true)
    expect(findCatalogContractViolations(tools, ignoredSwitch, 2)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Expected 2 copyright decision tools'),
        expect.stringContaining('Disabling copyright decision tools'),
      ]),
    )
  })

  it('rejects an unscoped tool leaking into tools/list', () => {
    const tools = fixtureRegistry()
    tools.push(fixtureTool('unscoped', { audience: 'user' }))
    expect(findCatalogContractViolations(tools, fixtureList(tools), 1)).toContain(
      'voucha-user-mcp catalog differs from tools/list',
    )
  })

  it('rejects a missing exposed registry', () => {
    const emptyList = (_user: unknown, _scopes: unknown, _config: McpServerConfig) => []
    expect(findCatalogContractViolations([], emptyList, 0)).toContain('No MCP tools are exposed')
  })

  it('rejects a decision tool missing from the enabled legal list', () => {
    const tools = fixtureRegistry()
    const list = fixtureList(tools)
    const missingDecision = (
      user: unknown,
      scopes: unknown,
      config: McpServerConfig,
      enabled: boolean,
    ) => list(user, scopes, config, enabled).filter(tool => tool.name !== 'legal_decision')
    expect(findCatalogContractViolations(tools, missingDecision, 1)).toContain(
      'Enabled copyright decision tools differ from registry order',
    )
  })

  it('rejects a read-only hint that names a mutating REST operation', () => {
    const tools = fixtureRegistry()
    tools[0]!.meta!.api = [{ method: 'POST', path: '/api/v1/topics' }]
    expect(findCatalogContractViolations(tools, fixtureList(tools), 1)).toContain(
      'user_read: a read-only tool names a non-GET operation',
    )
  })

  it('rejects absent output schemas and blank display titles', () => {
    const tools = fixtureRegistry()
    tools[0]!.meta!.outputSchema = undefined
    tools[0]!.meta!.title = '  '
    expect(findCatalogContractViolations(tools, fixtureList(tools), 1)).toEqual(
      expect.arrayContaining([
        'user_read: missing registry output schema',
        'user_read: missing catalog output schema',
        'user_read: missing display title',
      ]),
    )
  })
})
