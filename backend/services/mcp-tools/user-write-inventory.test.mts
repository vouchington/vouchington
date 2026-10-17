import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ALL_TOOLS } from '@voucha/mcp/registry/index'
import { adminMergedGroups } from '@voucha/mcp/registry/admin-merged-tools'
import { communityModerationGroups } from '@voucha/mcp/community-moderation-tools'
import { participationWriteGroups } from '@voucha/mcp/registry/participation-write-groups'
import { userMergedAccountGroups } from '@voucha/mcp/registry/user-merged-account-tools'
import { userMergedParticipationGroups } from '@voucha/mcp/registry/user-merged-participation-tools'
import { userMergedReadingGroups } from '@voucha/mcp/registry/user-merged-reading-tools'
import {
  ADMIN_SURFACE_PREFIX,
  EXCLUSION_CATEGORIES,
  communityOwnerAiExclusions,
  writeExclusions,
} from '@voucha/test-helpers/mcp-write-exclusions'
import { REQUEST_CONTRACT_EXEMPTIONS } from '../../api/request-contract-exemptions-helpers.mts'

// The authoritative inventory of REST writes against the user MCP server (#208).
//
// A write is every non-GET operation in api-fixtures/v1/request-contracts.json plus the non-GET
// routes exempt from a request contract. It is covered when a tool on the user `mcp` surface lists
// it in `meta.api`, including each option of a merged tool. A tool on the `admin_mcp` surface does
// not cover it, so staff writes that only an admin tool maps still need a `staff-only` row.
// Everything else needs one row in backend/test-helpers/mcp-write-exclusions*.mts, except
// `/api/v1/admin/**`, which the prefix rule excludes. The `undecided` rows are the open #208 work.

const requestContracts = JSON.parse(
  readFileSync(new URL('../../../api-fixtures/v1/request-contracts.json', import.meta.url), 'utf8'),
) as { operations: Record<string, unknown> }
const normalizePath = (path: string) => path.replace(/\{([^}]+)\}/g, ':$1')
const isWrite = (key: string) => !key.startsWith('GET:')

const mergedGroups = [
  ...participationWriteGroups,
  ...userMergedReadingGroups,
  ...userMergedParticipationGroups,
  ...userMergedAccountGroups,
  ...adminMergedGroups,
  ...communityModerationGroups,
]
const mergedNames = new Set(mergedGroups.map(group => group.name))
const sources = [
  ...ALL_TOOLS.filter(tool => !mergedNames.has(tool.schema.name)),
  ...mergedGroups.flatMap(group => group.options.map(({ source }) => source)),
]
const userMapped = new Set(
  sources
    .filter(source => source.meta?.surfaces.some(surface => surface === 'mcp'))
    .flatMap(source =>
      (source.meta?.api ?? []).map(api => `${api.method}:${normalizePath(api.path)}`),
    ),
)

const operations = [
  ...new Set([
    ...Object.keys(requestContracts.operations).filter(isWrite),
    ...Object.keys(REQUEST_CONTRACT_EXEMPTIONS).filter(isWrite),
  ]),
].toSorted()
const exclusions = [...writeExclusions, ...communityOwnerAiExclusions(operations)]
const keyOf = (entry: { method: string; path: string }) => `${entry.method}:${entry.path}`
const excludedKeys = new Set(exclusions.map(keyOf))
const isAdminSurface = (key: string) =>
  key.slice(key.indexOf(':') + 1).startsWith(ADMIN_SURFACE_PREFIX)

describe('user MCP write inventory', () => {
  it('maps or excludes every non-GET REST operation', () => {
    const unaccounted = operations.filter(
      key => !userMapped.has(key) && !excludedKeys.has(key) && !isAdminSurface(key),
    )
    expect(unaccounted).toEqual([])
  })

  it('has no stale exclusion for a removed route or a route a user tool now maps', () => {
    const live = new Set(operations)
    const stale = exclusions
      .map(keyOf)
      .filter(key => !live.has(key) || userMapped.has(key))
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

  it('keeps admin-surface routes out of the explicit table', () => {
    expect(exclusions.map(keyOf).filter(isAdminSurface)).toEqual([])
  })
})
