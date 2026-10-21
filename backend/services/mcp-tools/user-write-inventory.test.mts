import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ALL_TOOLS } from '@voucha/mcp/registry/index'
import { adminMergedGroups } from '@voucha/mcp/registry/admin-merged-tools'
import { brandTopicClaimGroups } from '@voucha/mcp/brand/topic-claims'
import { communityModerationGroups } from '@voucha/mcp/community-moderation-tools'
import { participationWriteGroups } from '@voucha/mcp/registry/participation-write-groups'
import { myHouseholdGroups } from '@voucha/mcp/my-households'
import { userMergedAccountGroups } from '@voucha/mcp/registry/user-merged-account-tools'
import { userMergedParticipationGroups } from '@voucha/mcp/registry/user-merged-participation-tools'
import { userMergedReadingGroups } from '@voucha/mcp/registry/user-merged-reading-tools'
import {
  EXCLUSION_CATEGORIES,
  communityOwnerAiExclusions,
  writeExclusions,
} from '@voucha/test-helpers/mcp-write-exclusions'
import { REQUEST_CONTRACT_EXEMPTIONS } from '../../api/request-contract-exemptions-helpers.mts'
import { ALL_MCP_SERVER_CONFIGS } from './config.mts'

// The authoritative inventory of REST writes exposed through any MCP server (#208).
// Every non-GET request-contract or exempt operation must map to exactly one tool option on one
// audience or have an explicit categorized exclusion.

const requestContracts = JSON.parse(
  readFileSync(new URL('../../../api-fixtures/v1/request-contracts.json', import.meta.url), 'utf8'),
) as { operations: Record<string, unknown> }
const normalizePath = (path: string) => path.replace(/\{([^}]+)\}/g, ':$1')
const isWrite = (key: string) => !key.startsWith('GET:')

const mergedGroups = [
  ...participationWriteGroups,
  ...myHouseholdGroups,
  ...userMergedReadingGroups,
  ...userMergedParticipationGroups,
  ...userMergedAccountGroups,
  ...adminMergedGroups,
  ...communityModerationGroups,
  ...brandTopicClaimGroups,
]
const mergedNames = new Set(mergedGroups.map(group => group.name))
const sources = [
  ...ALL_TOOLS.filter(tool => !mergedNames.has(tool.schema.name)),
  ...mergedGroups.flatMap(group => group.options.map(({ source }) => source)),
]
const mappedOperations = new Set(
  sources.flatMap(source =>
    source.meta?.audience
      ? (source.meta.api ?? []).map(api => `${api.method}:${normalizePath(api.path)}`)
      : [],
  ),
)

const operations = [
  ...new Set([
    ...Object.keys(requestContracts.operations).filter(isWrite),
    ...Object.keys(REQUEST_CONTRACT_EXEMPTIONS).filter(isWrite),
  ]),
].toSorted()
const protocolOperations = ALL_MCP_SERVER_CONFIGS.flatMap(config =>
  ['POST', 'GET', 'DELETE'].map(method => `${method}:${config.routePath}`),
)
const inventoryOperations = [...new Set([...operations, ...protocolOperations])].toSorted()
const exclusions = [...writeExclusions, ...communityOwnerAiExclusions(operations)]
const keyOf = (entry: { method: string; path: string }) => `${entry.method}:${entry.path}`
const excludedKeys = new Set(exclusions.map(keyOf))

describe('all-audience MCP write inventory', () => {
  it('maps or explicitly excludes every write and MCP transport operation', () => {
    const unaccounted = inventoryOperations.filter(
      key => !mappedOperations.has(key) && !excludedKeys.has(key),
    )
    expect(unaccounted).toEqual([])
  })

  it('lists each tool on exactly one audience', () => {
    const toolAudiencePairs = [
      ...ALL_TOOLS.filter(tool => !mergedNames.has(tool.schema.name)).flatMap(tool =>
        tool.meta?.audience ? [{ tool: tool.schema.name, audience: tool.meta.audience }] : [],
      ),
      ...mergedGroups.flatMap(group =>
        group.options.flatMap(({ source }) =>
          source.meta?.audience ? [{ tool: group.name, audience: source.meta.audience }] : [],
        ),
      ),
    ]
    const audiencesByTool = new Map<string, Set<string>>()
    for (const { tool, audience } of toolAudiencePairs) {
      const values = audiencesByTool.get(tool) ?? new Set<string>()
      values.add(audience)
      audiencesByTool.set(tool, values)
    }
    const duplicates = [...audiencesByTool.entries()]
      .filter(([, audiences]) => audiences.size !== 1)
      .map(([tool, audiences]) => ({ tool, audiences: [...audiences].toSorted() }))
    expect(duplicates).toEqual([])
  })

  it('mounts the brand server with its topic-claim tools', () => {
    expect(ALL_MCP_SERVER_CONFIGS.some(config => config.audience === 'brand')).toBe(true)
    expect(
      ALL_TOOLS.filter(tool => tool.meta?.audience === 'brand')
        .map(tool => tool.schema.name)
        .toSorted(),
    ).toEqual(['manage_topic_claim', 'read_my_topic_claims'])
  })

  it('has no stale exclusion for a removed route or a route any audience now maps', () => {
    const live = new Set(inventoryOperations)
    const stale = exclusions
      .map(keyOf)
      .filter(key => !live.has(key) || mappedOperations.has(key))
      .toSorted()
    expect(stale).toEqual([])
  })

  it('lists each operation once, in a known category, with a reason', () => {
    const keys = exclusions.map(keyOf)
    expect(keys.filter((key, index) => keys.indexOf(key) !== index)).toEqual([])
    for (const entry of exclusions) {
      expect(EXCLUSION_CATEGORIES).toContain(entry.category)
      expect(entry.reason.trim()).not.toBe('')
    }
  })
})
