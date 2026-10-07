import type { Tool, ToolMeta } from '@services/openai-agents/tool-types'
import { toolToMcpTool } from '@voucha/mcp/registry/adapters'
import { isToolMcpEligible, listToolsForSurface } from '@voucha/mcp/registry/select'
import { describe, expect, it } from 'vitest'
import type { McpServerConfig } from '../config.mts'
import { buildMcpCatalog } from './build-mcp-catalog.mts'
import { findCatalogContractViolations } from './check-catalog-contracts.mts'

type FixtureMeta = Partial<ToolMeta> & Pick<ToolMeta, 'surfaces'>

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
      surfaces: ['mcp'],
      requiredScopes: { mcp: ['topics:read'] },
      api: [{ method: 'GET', path: '/api/v1/topics/:id' }],
    }),
    fixtureTool(
      'admin_decision',
      {
        surfaces: ['admin_mcp'],
        requiredScopes: { admin_mcp: ['mcp.admin:read'] },
        switch: 'copyright.mcpDecisionTools',
      },
      { administrator: true },
    ),
    fixtureTool(
      'admin_other',
      {
        surfaces: ['admin_mcp'],
        requiredScopes: { admin_mcp: ['mcp.admin:read'] },
      },
      { administrator: true },
    ),
    fixtureTool('internal_only', { surfaces: ['internal'] }),
  ]
}

function fixtureList(tools: readonly Tool[]) {
  return (_user: unknown, _scopes: unknown, config: McpServerConfig, copyrightEnabled: boolean) =>
    listToolsForSurface(config.surface, tools)
      .filter(tool => isToolMcpEligible(tool))
      .filter(tool => copyrightEnabled || tool.meta?.switch !== 'copyright.mcpDecisionTools')
      .map(tool => toolToMcpTool(tool, config.surface))
}

describe('MCP catalog contracts with a tiny registry', () => {
  it('builds both server catalogs with paths, roles, REST hints, schema and title', () => {
    const catalog = buildMcpCatalog(fixtureRegistry())
    expect(catalog.servers.map(server => [server.name, server.path])).toEqual([
      ['voucha-user-mcp', '/api/v1/mcp'],
      ['voucha-admin-mcp', '/api/v1/admin/mcp'],
    ])
    expect(catalog.servers[0]?.tools.map(({ tool }) => tool.name)).toEqual(['user_read'])
    expect(catalog.servers[0]?.tools[0]).toMatchObject({
      plan: 'free',
      roles: null,
      api: [{ method: 'GET', path: '/api/v1/topics/:id' }],
      tool: { title: 'user_read', outputSchema: { type: 'object' } },
    })
    expect(catalog.servers[1]?.tools.map(({ tool }) => tool.name)).toEqual([
      'admin_decision',
      'admin_other',
    ])
    expect(catalog.servers[1]?.tools[0]).toMatchObject({ roles: ['administrator'] })
  })

  it('accepts a matching tools/list boundary and copyright switch', () => {
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
    tools.push(fixtureTool('unscoped', { surfaces: ['mcp'] }))
    expect(findCatalogContractViolations(tools, fixtureList(tools), 1)).toContain(
      'voucha-user-mcp catalog differs from tools/list',
    )
  })

  it('rejects a missing exposed registry', () => {
    expect(findCatalogContractViolations([], fixtureList([]), 0)).toContain(
      'No MCP tools are exposed',
    )
  })

  it('rejects a decision tool missing from the enabled admin list', () => {
    const tools = fixtureRegistry()
    const list = fixtureList(tools)
    const missingDecision = (
      user: unknown,
      scopes: unknown,
      config: McpServerConfig,
      enabled: boolean,
    ) => list(user, scopes, config, enabled).filter(tool => tool.name !== 'admin_decision')
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
