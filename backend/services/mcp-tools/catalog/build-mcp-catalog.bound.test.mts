import { myMessageGroups } from '@voucha/mcp/my-messages'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { hasEveryScope, SCOPE_DEFINITIONS, type ApiScope } from '@modules/scopes'
import { ALL_TOOLS } from '@voucha/mcp/registry/index'
import { communityModerationGroups } from '@voucha/mcp/community-moderation-tools'
import { userMergedReadingGroups } from '@voucha/mcp/registry/user-merged-reading-tools'
import { userMergedAccountGroups } from '@voucha/mcp/registry/user-merged-account-tools'
import { userMergedParticipationGroups } from '@voucha/mcp/registry/user-merged-participation-tools'
import { participationWriteGroups } from '@voucha/mcp/registry/participation-write-groups'
import { adminMergedGroups } from '@voucha/mcp/registry/admin-merged-tools'
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
const grants: {
  name: 'all' | 'Reader' | 'Plus' | 'Reviewer'
  roles: string[]
  plan: 'plus' | 'pro' | null
  scopes: ApiScope[]
}[] = [
  {
    name: 'all',
    roles: [...new Set(ALL_TOOLS.flatMap(tool => Object.keys(tool.roles ?? {})))],
    plan: 'pro' as const,
    scopes: Object.keys(SCOPE_DEFINITIONS) as ApiScope[],
  },
  { name: 'Reader', roles: [], plan: null, scopes: readerScopes },
  {
    name: 'Plus',
    roles: [],
    plan: 'plus' as const,
    scopes: ['mcp.user:read', 'mcp.user:write'] as ApiScope[],
  },
  {
    name: 'Reviewer',
    roles: ['administrator'],
    plan: null,
    scopes: ['moderation:read'] as ApiScope[],
  },
]

// Plus is umbrella-only; Reader and Plus caps are inherited from main.
// Owner-approved mcp.all caps: compact UTF-16 sizes plus 1.5%, rounded up to 1,000.
const caps = {
  mcp: {
    all: { count: 80, list: 311000, core: 124000, output: 292000 },
    Reader: { count: 9, list: 55000, core: 25000, output: 53000 },
    Plus: { count: 70, list: 217000, core: 110000, output: 240000 },
    Reviewer: { count: 0, list: 2, core: 2, output: 2 },
  },
  admin_mcp: {
    all: { count: 75, list: 260000, core: 50000, output: 220000 },
    Reader: { count: 0, list: 2, core: 2, output: 2 },
    Plus: { count: 0, list: 2, core: 2, output: 2 },
    Reviewer: { count: 8, list: 65000, core: 7000, output: 60000 },
  },
}
const allAdminDisabled = { count: 60, list: 205463, core: 34301, output: 193749 }
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
  it('publishes every canonical member option mapping and preserves the admin listing contract', () => {
    const user = catalog.servers.find(server => server.surface === 'mcp')!
    const canonicalOptions = user.tools.filter(({ tool }) => {
      const branches = tool.inputSchema['oneOf'] as Record<string, unknown>[] | undefined
      return (
        branches?.length &&
        branches.every(branch => {
          const properties = branch['properties'] as
            | Record<string, Record<string, unknown>>
            | undefined
          const values = properties?.['option']?.['enum']
          const required = branch['required'] as string[] | undefined
          return (
            Array.isArray(values) &&
            values.length === 1 &&
            typeof values[0] === 'string' &&
            properties?.['arguments'] &&
            required?.includes('option') &&
            required.includes('arguments')
          )
        })
      )
    })
    expect(
      user.tools
        .filter(entry => entry.tool['_meta']?.['voucha/optionOutputPointers'])
        .map(entry => entry.tool.name)
        .toSorted(),
    ).toEqual(canonicalOptions.map(entry => entry.tool.name).toSorted())
    const mapped = ALL_TOOLS.filter(
      tool => tool.meta?.surfaces.includes('mcp') && tool.meta.optionOutputPointers,
    )
    expect(mapped.length).toBeGreaterThan(0)
    for (const tool of mapped) {
      const listed = user.tools.find(entry => entry.tool.name === tool.schema.name)!.tool
      expect(listed['_meta']?.['voucha/optionOutputPointers']).toEqual(
        tool.meta!.optionOutputPointers,
      )
    }
    const admin = catalog.servers.find(server => server.surface === 'admin_mcp')!
    expect(admin.tools.every(entry => !entry.tool['_meta']?.['voucha/optionOutputPointers'])).toBe(
      true,
    )
  })

  it('limits every tool or option description to 400 characters, with named offenders', () => {
    const groups = [
      ...myMessageGroups,
      ...userMergedReadingGroups,
      ...userMergedAccountGroups,
      ...userMergedParticipationGroups,
      ...participationWriteGroups,
      ...adminMergedGroups,
      ...communityModerationGroups,
    ]
    const mergedNames = new Set(groups.map(group => group.name))
    const descriptions = [
      ...groups.flatMap(group =>
        group.options.map(({ option, source }) => ({
          name: `${group.name}.${option}`,
          description: `${option}: ${source.schema.description ?? ''}`,
        })),
      ),
      ...ALL_TOOLS.filter(tool => !mergedNames.has(tool.schema.name)).map(tool => ({
        name: tool.schema.name,
        description: tool.schema.description ?? '',
      })),
    ]
    const offenders = descriptions
      .filter(({ description }) => description.length > 400)
      .map(({ name, description }) => `${name}: ${description.length} characters`)
      .toSorted()
    expect(offenders).toEqual([])
  })

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
              if (entry.plan === 'plus' && caller.membership_plan === null) return false
              if (entry.plan === 'pro' && caller.membership_plan !== 'pro') return false
              return (
                !!entry.tool['_meta'] &&
                hasEveryScope(
                  grant.scopes,
                  entry.tool['_meta']['voucha/requiredScopes'] as ApiScope[],
                )
              )
            })
            .map(entry => entry.tool)
          expect(tools).toEqual(expected)
          const cap =
            config.surface === 'admin_mcp' && grant.name === 'all' && !enabled
              ? allAdminDisabled
              : caps[config.surface][grant.name]
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

const names = [
  'vote',
  'set_rss_feed_item_read',
  'share_rss_feed_item',
  'submit_rss_feed',
  'start_discussion',
]
const scopes = (Object.keys(SCOPE_DEFINITIONS) as ApiScope[]).filter(
  scope => !scope.startsWith('community-moderation:') && !scope.startsWith('messages:'),
)
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const caller = { id: 'participation-listing', roles: [], membership_plan: null }

// Listing snapshots rebaselined for #2961 prose; #2545 capability gates stay unchanged.
describe('participation write discovery contract', () => {
  it('pins the trimmed Reader tools/list', () => {
    const listing = listMcpToolsForUser(caller, readerScopes, USER_MCP_SERVER_CONFIG, true)
    expect(JSON.stringify(listing)).toHaveLength(54252)
    expect(hash(listing)).toBe('6581aa2f8113cbe93e857afc30f77f8c5178c12d69c1ddefb2b5b527bda1cd0b')
  })
  it('keeps the five approved participation tools in the paid listing', () => {
    const paid = listMcpToolsForUser(
      { ...caller, membership_plan: 'plus' },
      scopes,
      USER_MCP_SERVER_CONFIG,
      true,
    )
    expect(paid).toHaveLength(74)
    expect(
      paid
        .filter(tool => names.includes(tool.name))
        .map(tool => tool.name)
        .toSorted(),
    ).toEqual(names.toSorted())
    expect(hash(paid.filter(tool => !names.includes(tool.name)))).toBe(
      '4953dda201a18f9cb8621ef7080f53f523ef930ba5d98d29de680038f3158e55',
    )
    for (const config of [USER_MCP_SERVER_CONFIG, ADMIN_MCP_SERVER_CONFIG]) {
      expect(
        listMcpToolsForUser(caller, scopes, config, true).some(tool => names.includes(tool.name)),
      ).toBe(false)
    }
  })
})
