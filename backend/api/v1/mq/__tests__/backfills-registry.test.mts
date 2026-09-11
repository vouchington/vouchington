import { describe, it, expect } from 'vitest'
import { getPublicBaseTableNamesForTest } from '@voucha/test-helpers'
import { EXISTING_DISPATCHER_BACKFILLS } from '../backfills-existing-dispatchers.mts'
import { BACKFILL_REGISTRY } from '../backfills-registry.mts'

const ALLOWED_EXTERNAL_SOURCES = new Set(['external:kagi-smallweb', 'external:ses-inbound-s3'])
const EXPECTED_EXISTING_DISPATCHER_BACKFILL_IDS = new Set([
  'crawl-hostnames-dispatch',
  'crawl-tier1-dispatch',
  'crawl-tier2-dispatch',
  'sitemaps-nightly-week',
  'sitemaps-weekly-month',
  'sitemaps-monthly-archive',
  'bedrock-embeddings-poll-dispatch',
  'bloom-filters-posts',
  'bloom-filters-topics',
  'bloom-filters-users',
  'bloom-filters-communities',
  'bloom-filters-rss-feed-items',
  'vote-weight-dispatch',
  'find-your-friends-dispatch',
  'oauth-authorization-exchange-dispatch',
  'kagi-smallweb-sync',
  'topic-aliases-category-mapping-reconciliation',
])

describe('BACKFILL_REGISTRY', () => {
  it('registers every existing self-healing dispatcher backfill', () => {
    const existingDispatcherIds = new Set(
      EXISTING_DISPATCHER_BACKFILLS.map(backfill => backfill.id),
    )
    const registeredIds = new Set(BACKFILL_REGISTRY.map(backfill => backfill.id))

    expect(existingDispatcherIds).toEqual(EXPECTED_EXISTING_DISPATCHER_BACKFILL_IDS)

    for (const id of existingDispatcherIds) {
      expect(registeredIds.has(id)).toBe(true)
    }
  })

  it('has no duplicate ids', () => {
    const ids = BACKFILL_REGISTRY.map(b => b.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it('every entry has a trigger function', () => {
    for (const entry of BACKFILL_REGISTRY) {
      expect(typeof entry.trigger).toBe('function')
    }
  })

  it('every entry has non-empty source table metadata without duplicate values', () => {
    for (const entry of BACKFILL_REGISTRY) {
      expect(typeof entry.source_table).toBe('string')
      expect(entry.source_table.length).toBeGreaterThan(0)
      const sourceTables = parseSourceTables(entry.source_table)
      expect(sourceTables.length).toBeGreaterThan(0)
      expect(new Set(sourceTables).size).toBe(sourceTables.length)
    }
  })

  it('source_table values are real Postgres tables or allowlisted external sources', async () => {
    const tableNames = await getPublicBaseTableNamesForTest()

    expect(
      BACKFILL_REGISTRY.flatMap(entry =>
        parseSourceTables(entry.source_table).flatMap(sourceTable => {
          if (sourceTable.startsWith('external:')) {
            if (!ALLOWED_EXTERNAL_SOURCES.has(sourceTable)) {
              return [`${entry.id}: ${sourceTable} is not an allowlisted external source`]
            }
            return []
          }
          if (!tableNames.has(sourceTable)) return [`${entry.id}: ${sourceTable} is not a table`]
          return []
        }),
      ),
    ).toEqual([])
  })

  it('every entry has a non-empty id, queue_name, job_name, and description', () => {
    for (const entry of BACKFILL_REGISTRY) {
      expect(typeof entry.id).toBe('string')
      expect(entry.id.length).toBeGreaterThan(0)
      expect(typeof entry.queue_name).toBe('string')
      expect(entry.queue_name.length).toBeGreaterThan(0)
      expect(typeof entry.job_name).toBe('string')
      expect(entry.job_name.length).toBeGreaterThan(0)
      expect(typeof entry.description).toBe('string')
      expect(entry.description.length).toBeGreaterThan(0)
    }
  })

  it('has at least one entry', () => {
    expect(BACKFILL_REGISTRY.length).toBeGreaterThan(0)
  })
})

function parseSourceTables(sourceTable: string): string[] {
  return sourceTable.split(',').map(source => source.trim())
}
