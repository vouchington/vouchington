import { readFileSync } from 'node:fs'
import { SCOPE_DEFINITIONS, type ApiScope } from '@modules/scopes'
import { ALL_TOOLS } from '@voucha/mcp/registry/index'
import type { McpToolShape } from '@voucha/mcp/registry/adapters'
import { describe, expect, it } from 'vitest'
import { ADMIN_MCP_SERVER_CONFIG, USER_MCP_SERVER_CONFIG } from '../config.mts'
import { MCP_SERVER_INSTRUCTIONS } from '../instructions.mts'
import { listMcpToolsForUser } from '../list-tools.mts'
import { buildMcpCatalog, type McpCatalog } from './build-mcp-catalog.mts'

const catalog = JSON.parse(
  readFileSync(new URL('../../../../api-fixtures/v1/mcp.json', import.meta.url), 'utf8'),
) as McpCatalog

const readerScopes: ApiScope[] = [
  'topics:read',
  'posts:read',
  'rss-feeds:read',
  'rss-feed-items:read',
  'feeds:read',
  'reference-data:read',
]
const grants = [
  {
    name: 'all',
    roles: [...new Set(ALL_TOOLS.flatMap(tool => Object.keys(tool.roles ?? {})))],
    plan: 'pro' as const,
    scopes: Object.keys(SCOPE_DEFINITIONS) as ApiScope[],
  },
  { name: 'Reader', roles: [], plan: null, scopes: readerScopes },
  {
    name: 'Reviewer',
    roles: ['administrator'],
    plan: null,
    scopes: ['moderation:read'] as ApiScope[],
  },
]

// Final #2495 user-server ceilings. Sizes are compact UTF-16 code units.
const caps = {
  mcp: {
    all: { count: 69, list: 260000, core: 110000, output: 240000 },
    Reader: { count: 9, list: 65000, core: 30000, output: 60000 },
    Reviewer: { count: 0, list: 2, core: 2, output: 2 },
  },
  admin_mcp: {
    all: { count: 105, list: 336840, core: 50000, output: 315696 },
    Reader: { count: 0, list: 2, core: 2, output: 2 },
    Reviewer: { count: 12, list: 100130, core: 7000, output: 98120 },
  },
}
const allAdminDisabled = { count: 88, list: 313583, core: 50000, output: 296443 }
const baseInstructions = { mcp: 656, admin_mcp: 347 }
const length = (value: unknown) => JSON.stringify(value).length

function measure(tools: readonly McpToolShape[]) {
  return {
    count: tools.length,
    list: length(tools),
    core: length(
      tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
    ),
    output: length(
      tools.map(({ name, description, inputSchema, outputSchema }) => ({
        name,
        description,
        inputSchema,
        outputSchema,
      })),
    ),
  }
}

const copyrightDecisions = new Set(
  ALL_TOOLS.filter(tool => tool.meta?.switch === 'copyright.mcpDecisionTools').map(
    tool => tool.schema.name,
  ),
)

describe('generated MCP catalog budgets through real tools/list filtering', () => {
  it('keeps the generated fixture identical to the complete live registry catalog', () => {
    expect(buildMcpCatalog(ALL_TOOLS)).toEqual(catalog)
  })

  for (const config of [USER_MCP_SERVER_CONFIG, ADMIN_MCP_SERVER_CONFIG]) {
    it(`${config.surface} limits serialized initialize instructions growth`, () => {
      expect(length(MCP_SERVER_INSTRUCTIONS[config.surface])).toBeLessThanOrEqual(
        baseInstructions[config.surface] + 4000,
      )
    })
    for (const grant of grants)
      for (const enabled of [false, true]) {
        it(`${config.surface}/${grant.name} copyright=${enabled} respects count and size caps`, () => {
          const caller = {
            id: 'catalog-budget-caller',
            roles: grant.roles,
            membership_plan: grant.plan,
          }
          const tools = listMcpToolsForUser(caller, grant.scopes, config, enabled)
          const server = catalog.servers.find(candidate => candidate.surface === config.surface)!
          const expected = server.tools
            .filter(entry => {
              if (!enabled && copyrightDecisions.has(entry.tool.name)) return false
              if (entry.roles?.length && !entry.roles.some(role => caller.roles.includes(role)))
                return false
              if ('plan' in entry && entry.plan !== 'free' && caller.membership_plan !== 'pro')
                return false
              return (
                entry.tool['_meta']?.['voucha/requiredScopes'].every(scope =>
                  (grant.scopes as readonly string[]).includes(scope),
                ) ?? false
              )
            })
            .map(entry => entry.tool)
          expect(tools).toEqual(expected)
          const cap =
            config.surface === 'admin_mcp' && grant.name === 'all' && !enabled
              ? allAdminDisabled
              : caps[config.surface][grant.name as 'all' | 'Reader' | 'Reviewer']
          for (const [metric, value] of Object.entries(measure(tools))) {
            expect(value).toBeLessThanOrEqual(cap[metric as keyof typeof cap])
          }
        })
      }
  }

  it('filters absent scopes, staff roles, and paid plans at the listing boundary', () => {
    const member = { id: 'catalog-budget-member', roles: [], membership_plan: null }
    const allScopes = Object.keys(SCOPE_DEFINITIONS) as ApiScope[]
    expect(listMcpToolsForUser(member, [], USER_MCP_SERVER_CONFIG, true)).toEqual([])
    expect(listMcpToolsForUser(member, allScopes, ADMIN_MCP_SERVER_CONFIG, true)).toEqual([])
    const freeTools = listMcpToolsForUser(member, allScopes, USER_MCP_SERVER_CONFIG, true)
    const paidNames = catalog.servers
      .find(server => server.surface === 'mcp')!
      .tools.filter(entry => 'plan' in entry && entry.plan !== 'free')
      .map(entry => entry.tool.name)
    expect(paidNames.length).toBeGreaterThan(0)
    expect(freeTools.every(tool => !paidNames.includes(tool.name))).toBe(true)
  })
})
