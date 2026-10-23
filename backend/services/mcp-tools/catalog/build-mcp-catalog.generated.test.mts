import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { SCOPE_DEFINITIONS, type ApiScope } from '@modules/scopes'
import { ALL_TOOLS } from '@voucha/mcp/registry/index'
import { myMessageGroups } from '@voucha/mcp/my-messages'
import { brandTopicClaimGroups } from '@voucha/mcp/brand/topic-claims'
import { myHouseholdGroups } from '@voucha/mcp/my-households'
import { communityModerationGroups } from '@voucha/mcp/community-moderation-tools'
import { userMergedReadingGroups } from '@voucha/mcp/registry/user-merged-reading-tools'
import { userMergedAccountGroups } from '@voucha/mcp/registry/user-merged-account-tools'
import { userMergedParticipationGroups } from '@voucha/mcp/registry/user-merged-participation-tools'
import { participationWriteGroups } from '@voucha/mcp/registry/participation-write-groups'
import { adminMergedGroups } from '@voucha/mcp/registry/admin-merged-tools'
import { describe, expect, it } from 'vitest'
import {
  ALL_MCP_SERVER_CONFIGS,
  ADMIN_MCP_SERVER_CONFIG,
  USER_MCP_SERVER_CONFIG,
} from '../config.mts'
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
const length = (value: unknown) => JSON.stringify(value).length

const groups = [
  ...myMessageGroups,
  ...myHouseholdGroups,
  ...userMergedReadingGroups,
  ...userMergedAccountGroups,
  ...userMergedParticipationGroups,
  ...participationWriteGroups,
  ...adminMergedGroups,
  ...communityModerationGroups,
  ...brandTopicClaimGroups,
]
const mergedNames = new Set(groups.map(group => group.name))
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const customer = { id: 'catalog-contract-caller', roles: [], membership_plan: null }
const participationNames = [
  'act_on_post',
  'vote',
  'set_rss_feed_item_read',
  'share_rss_feed_item',
  'submit_rss_feed',
  'start_discussion',
]
const plusScopes = (Object.keys(SCOPE_DEFINITIONS) as ApiScope[]).filter(
  scope =>
    SCOPE_DEFINITIONS[scope].audience === 'user' &&
    !scope.startsWith('community-moderation:') &&
    !scope.startsWith('messages:') &&
    !scope.startsWith('households:'),
)

describe('generated MCP catalog contracts', () => {
  it.each(['user', 'community_moderation'] as const)(
    'publishes canonical %s option mappings',
    audience => {
      const user = catalog.servers.find(server => server.audience === audience)!
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
        tool => tool.meta?.audience === audience && tool.meta.optionOutputPointers,
      )
      expect(mapped.length).toBeGreaterThan(0)
      for (const tool of mapped) {
        const listed = user.tools.find(entry => entry.tool.name === tool.schema.name)!.tool
        expect(listed['_meta']?.['voucha/optionOutputPointers']).toEqual(
          tool.meta!.optionOutputPointers,
        )
      }
      expect(
        catalog.servers
          .filter(server => !['user', 'community_moderation'].includes(server.audience))
          .every(server =>
            server.tools.every(entry => !entry.tool['_meta']?.['voucha/optionOutputPointers']),
          ),
      ).toBe(true)
    },
  )

  it('limits every tool and option description to 400 characters with named offenders', () => {
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

  it('limits serialized initialize-instruction growth for every configured audience', () => {
    const baseline = {
      user: 1532,
      community_moderation: 509,
      brand: 488,
      admin: 565,
      legal: 504,
    }
    for (const config of ALL_MCP_SERVER_CONFIGS) {
      expect(length(MCP_SERVER_INSTRUCTIONS[config.audience])).toBeLessThanOrEqual(
        baseline[config.audience] + 4000,
      )
    }
  })

  it('filters absent scopes, staff roles, and paid plans at the listing boundary', () => {
    const allScopes = Object.keys(SCOPE_DEFINITIONS) as ApiScope[]
    expect(listMcpToolsForUser(customer, [], USER_MCP_SERVER_CONFIG)).toEqual([])
    expect(listMcpToolsForUser(customer, allScopes, ADMIN_MCP_SERVER_CONFIG)).toEqual([])
    const freeTools = listMcpToolsForUser(customer, allScopes, USER_MCP_SERVER_CONFIG)
    const paidNames = catalog.servers
      .find(server => server.audience === 'user')!
      .tools.filter(entry => 'plan' in entry && entry.plan !== 'free')
      .map(entry => entry.tool.name)
    expect(paidNames.length).toBeGreaterThan(0)
    expect(freeTools.every(tool => !paidNames.includes(tool.name))).toBe(true)
  })

  it('pins Reader and Plus participation-discovery snapshots', () => {
    const reader = listMcpToolsForUser(customer, readerScopes, USER_MCP_SERVER_CONFIG)
    expect(JSON.stringify(reader)).toHaveLength(54150)
    expect(hash(reader)).toBe('2b9c67f35b827c4779f6ab32a3014e9e730df28d14406f2548f60c7de488f4d7')

    const paid = listMcpToolsForUser(
      { ...customer, membership_plan: 'plus' },
      plusScopes,
      USER_MCP_SERVER_CONFIG,
    )
    expect(paid).toHaveLength(74)
    expect(
      paid
        .filter(tool => participationNames.includes(tool.name))
        .map(tool => tool.name)
        .toSorted(),
    ).toEqual(participationNames.toSorted())
    expect(hash(paid.filter(tool => !participationNames.includes(tool.name)))).toBe(
      'd4270e57ff97e41704909fe249df7ba47e2dcb6d1c9bedcbfcc65147092a266f',
    )
    for (const config of [USER_MCP_SERVER_CONFIG, ADMIN_MCP_SERVER_CONFIG]) {
      expect(
        listMcpToolsForUser(customer, plusScopes, config).some(tool =>
          participationNames.includes(tool.name),
        ),
      ).toBe(false)
    }
  })
})
