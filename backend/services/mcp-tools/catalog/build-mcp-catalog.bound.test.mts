import { readFileSync } from 'node:fs'
import { hasEveryScope, SCOPE_DEFINITIONS, type ApiScope } from '@modules/scopes'
import { ALL_TOOLS } from '@voucha/mcp/registry/index'
import type { McpToolShape } from '@voucha/mcp/registry/adapters'
import { describe, expect, it } from 'vitest'
import { ALL_MCP_SERVER_CONFIGS } from '../config.mts'
import { listMcpToolsForUser } from '../list-tools.mts'
import type { McpCatalog } from './build-mcp-catalog.mts'

type SizeBudget = { count: number; list: number; core: number; output: number }
type BudgetFile = {
  servers: Record<string, Record<string, { on: SizeBudget; off?: SizeBudget }>>
}

const catalog = JSON.parse(
  readFileSync(new URL('../../../../api-fixtures/v1/mcp.json', import.meta.url), 'utf8'),
) as McpCatalog
const perToolBudgets = JSON.parse(
  readFileSync(new URL('../../../test-helpers/mcp-tool-budgets.json', import.meta.url), 'utf8'),
) as {
  servers: Record<
    string,
    Record<
      string,
      { measured: { list: number; core: number }; max: { list: number; core: number } }
    >
  >
}
const budgets = JSON.parse(
  readFileSync(new URL('../../../test-helpers/mcp-catalog-budgets.json', import.meta.url), 'utf8'),
) as BudgetFile

const readerScopes: ApiScope[] = [
  'topics:read',
  'posts:read',
  'rss-feeds:read',
  'rss-feed-items:read',
  'feeds:read',
  'reference-data:read',
]
const grants: {
  name: string
  roles: string[]
  plan: 'plus' | 'pro' | null
  scopes: ApiScope[]
}[] = [
  {
    name: 'all',
    roles: [...new Set(ALL_TOOLS.flatMap(tool => Object.keys(tool.roles ?? {})))],
    plan: 'pro',
    scopes: Object.keys(SCOPE_DEFINITIONS) as ApiScope[],
  },
  { name: 'Reader', roles: [], plan: null, scopes: readerScopes },
  { name: 'Plus', roles: [], plan: 'plus', scopes: ['mcp.user:read', 'mcp.user:write'] },
  { name: 'Reviewer', roles: ['administrator'], plan: null, scopes: ['moderation:read'] },
  {
    name: 'CommunityFree',
    roles: [],
    plan: null,
    scopes: ['community-moderation:read'],
  },
  {
    name: 'CommunityPlus',
    roles: [],
    plan: 'plus',
    scopes: ['community-moderation:read', 'community-moderation:write'],
  },
  {
    name: 'LegalRead',
    roles: ['administrator'],
    plan: null,
    scopes: ['copyright-notices:read'],
  },
  {
    name: 'LegalWrite',
    roles: ['administrator'],
    plan: null,
    scopes: ['copyright-notices:read', 'copyright-notices:write'],
  },
]

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
function expectedGrantBudget(
  audience: string,
  grant: string,
  actual: ReturnType<typeof measure>,
): SizeBudget {
  const roundBudget = (measured: number) => Math.ceil((measured * 1.015) / 1000) * 1000
  if (audience === 'user' && grant === 'Reader') {
    return {
      count: actual.count,
      list: 55000,
      core: roundBudget(actual.core),
      output: roundBudget(actual.output),
    }
  }
  if (audience === 'user' && grant === 'Plus') {
    return { count: actual.count, list: 228000, core: 110000, output: 240000 }
  }
  return {
    count: actual.count,
    list: roundBudget(actual.list),
    core: roundBudget(actual.core),
    output: roundBudget(actual.output),
  }
}
const copyrightDecisions = new Set(
  ALL_TOOLS.filter(tool => tool.meta?.switch === 'copyright.mcpDecisionTools').map(
    tool => tool.schema.name,
  ),
)

describe('per-server grant budgets', () => {
  for (const config of ALL_MCP_SERVER_CONFIGS) {
    for (const grant of grants) {
      for (const enabled of [false, true]) {
        it(`${config.audience}/${grant.name} switch=${enabled} stays within pinned catalog budgets`, () => {
          const caller = {
            id: 'catalog-budget-caller',
            roles: grant.roles,
            membership_plan: grant.plan,
          }
          const tools = listMcpToolsForUser(caller, grant.scopes, config, enabled)
          const server = catalog.servers.find(candidate => candidate.audience === config.audience)!
          const expected = server.tools
            .filter(entry => {
              if (!enabled && copyrightDecisions.has(entry.tool.name)) return false
              if (entry.roles?.length && !entry.roles.some(role => caller.roles.includes(role)))
                return false
              if (entry.plan === 'plus' && caller.membership_plan === null) return false
              if (entry.plan === 'pro' && caller.membership_plan !== 'pro') return false
              return hasEveryScope(
                grant.scopes,
                entry.tool['_meta']!['voucha/requiredScopes'] as ApiScope[],
              )
            })
            .map(entry => entry.tool)
          expect(tools).toEqual(expected)
          const row = budgets.servers[config.audience]![grant.name]!
          const cap = enabled ? row.on : (row.off ?? row.on)
          const measured = measure(tools)
          expect(cap).toEqual(expectedGrantBudget(config.audience, grant.name, measured))
          expect(measured.count).toBe(cap.count)
          expect(measured.list).toBeLessThanOrEqual(cap.list)
          expect(measured.core).toBeLessThanOrEqual(cap.core)
          expect(measured.output).toBeLessThanOrEqual(cap.output)
          for (const tool of tools) {
            const pinned = perToolBudgets.servers[config.audience]![tool.name]!
            expect(length(tool)).toBeLessThanOrEqual(pinned.max.list)
            expect(
              length({
                name: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema,
              }),
            ).toBeLessThanOrEqual(pinned.max.core)
          }
        })
      }
    }
  }
})

describe('per-tool catalog size evidence', () => {
  it('pins every tool measurement and rounds its cap at 1.5% to the next 1,000', () => {
    const roundBudget = (measured: number) => Math.ceil((measured * 1.015) / 1000) * 1000
    expect(Object.keys(perToolBudgets.servers).toSorted()).toEqual(
      ALL_MCP_SERVER_CONFIGS.map(config => config.audience).toSorted(),
    )
    for (const server of catalog.servers) {
      const pinned = perToolBudgets.servers[server.audience]!
      expect(Object.keys(pinned).toSorted()).toEqual(
        server.tools.map(({ tool }) => tool.name).toSorted(),
      )
      for (const { tool } of server.tools) {
        const evidence = pinned[tool.name]!
        const measuredList = length(tool)
        const measuredCore = length({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })
        expect(evidence.measured).toEqual({ list: measuredList, core: measuredCore })
        expect(evidence.max).toEqual({
          list: roundBudget(measuredList),
          core: roundBudget(measuredCore),
        })
      }
    }
  })

  it('keeps full and Plus user core listings below the pre-split baseline', () => {
    const allRoles = [...new Set(ALL_TOOLS.flatMap(tool => Object.keys(tool.roles ?? {})))]
    const allScopes = Object.keys(SCOPE_DEFINITIONS) as ApiScope[]
    const user = ALL_MCP_SERVER_CONFIGS.find(config => config.audience === 'user')!
    const allCore = measure(
      listMcpToolsForUser(
        { id: 'all-user-catalog-grants', roles: allRoles, membership_plan: 'pro' },
        allScopes,
        user,
      ),
    ).core
    const plusCore = measure(
      listMcpToolsForUser(
        { id: 'plus-user-community-scopes', roles: [], membership_plan: 'plus' },
        allScopes,
        user,
      ),
    ).core
    expect(allCore).toBeLessThan(124841)
    expect(plusCore).toBeLessThan(124841)
  })
})
