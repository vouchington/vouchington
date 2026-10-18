import { describe, it, expect } from 'vitest'
import {
  getPublicBaseTableNamesForTest,
  isDeduplicatedEnqueue,
  readEnqueuedJob,
} from '@voucha/test-helpers'
import { activitypub } from '@queues/activitypub/queues'
import { scheduledJobManifest as embeddingReconciliationManifest } from '@queues/bedrock-embeddings-batch/enqueues/schedules'
import { backgroundCpu as bedrock_embeddings_batch } from '@queues/background-cpu/queues'
import { voteAggregation } from '@queues/vote-aggregation/queues'
import { EXISTING_DISPATCHER_BACKFILLS } from '@services/queue-monitoring/backfills-existing-dispatchers'
import { BACKFILL_REGISTRY } from '@services/queue-monitoring/backfills-registry'

const ALLOWED_EXTERNAL_SOURCES = new Set(['external:kagi-smallweb', 'external:ses-inbound-s3'])
const EXPECTED_EXISTING_DISPATCHER_BACKFILL_IDS = new Set([
  'crawl-hostnames-dispatch',
  'crawl-tier1-dispatch',
  'crawl-tier2-dispatch',
  'sitemaps-nightly-week',
  'sitemaps-weekly-month',
  'sitemaps-monthly-archive',
  'bedrock-embeddings-poll-dispatch',
  'bedrock-embedding-reconciliation',
  'bloom-filters-posts',
  'bloom-filters-topics',
  'bloom-filters-users',
  'bloom-filters-communities',
  'bloom-filters-rss-feed-items',
  'vote-weight-age-milestones',
  'vote-weight-membership-expirations',
  'vote-weight-family-source-changes',
  'vote-weight-dirty-markers',
  'relation-election-updates',
  'find-your-friends-dispatch',
  'oauth-authorization-exchange-dispatch',
  'kagi-smallweb-sync',
  'topic-aliases-category-mapping-reconciliation',
])

describe('BACKFILL_REGISTRY', () => {
  it('starts all four embedding reconciliation roots from its operator entry', async () => {
    const entry = BACKFILL_REGISTRY.find(
      candidate => candidate.id === 'bedrock-embedding-reconciliation',
    )
    if (!entry) throw new Error('Embedding reconciliation backfill missing')
    const enqueued = await entry.trigger()
    if (!Array.isArray(enqueued)) throw new Error('Expected all four root enqueues')
    const expected = [
      { name: 'reconcile_existing', data: { entityType: 'topics' } },
      { name: 'reconcile_existing', data: { entityType: 'posts' } },
      { name: 'reconcile_existing', data: { entityType: 'rss_feed_items' } },
      { name: 'post_trigger_recovery', data: {} },
    ]
    expect(enqueued).toHaveLength(expected.length)
    expect(
      embeddingReconciliationManifest.jobs
        .filter(job => expected.some(root => root.name === job.template.name))
        .map(job => ({ name: job.template.name, data: job.template.data })),
    ).toEqual(expected)
    for (const [index, result] of enqueued.entries()) {
      if (isDeduplicatedEnqueue(result)) continue
      await expect(readEnqueuedJob(bedrock_embeddings_batch, result)).resolves.toMatchObject(
        expected[index]!,
      )
    }
  })
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

  it('enqueues the ActivityPub failed-delivery rearm', async () => {
    const entry = BACKFILL_REGISTRY.find(
      candidate => candidate.id === 'activitypub-inbox-failed-deliveries',
    )
    if (!entry) throw new Error('ActivityPub failed-delivery backfill missing')
    const enqueued = await entry.trigger()
    if (isDeduplicatedEnqueue(enqueued)) return
    await expect(readEnqueuedJob(activitypub, enqueued)).resolves.toMatchObject({
      name: 'activitypub.rearmFailedDeliveries',
    })
  })

  it('recovers relation tally pages even when saved user weights are unchanged', async () => {
    const entry = BACKFILL_REGISTRY.find(candidate => candidate.id === 'relation-election-updates')
    if (!entry) throw new Error('Relation election backfill missing')
    const enqueued = await entry.trigger()
    if (isDeduplicatedEnqueue(enqueued)) return
    await expect(readEnqueuedJob(voteAggregation, enqueued)).resolves.toMatchObject({
      name: 'vote-aggregation.processRecalculateVoteWeightDispatcher',
      data: { replayElectionsOnly: true },
    })
  })

  it.each([
    ['vote-weight-age-milestones', 'processVoteWeightAgeMilestones'],
    ['vote-weight-membership-expirations', 'processVoteWeightMembershipExpirations'],
    ['vote-weight-family-source-changes', 'processVoteWeightFamilySourceChanges'],
  ])('enqueues the %s backfill', async (id, jobName) => {
    const entry = BACKFILL_REGISTRY.find(candidate => candidate.id === id)
    if (!entry) throw new Error(`${id} backfill missing`)
    const enqueued = await entry.trigger()
    if (isDeduplicatedEnqueue(enqueued)) return
    await expect(readEnqueuedJob(voteAggregation, enqueued)).resolves.toMatchObject({
      name: `vote-aggregation.${jobName}`,
      data: { fullReplay: true },
    })
  })

  it('starts the dirty-marker recovery backfill', async () => {
    const entry = BACKFILL_REGISTRY.find(candidate => candidate.id === 'vote-weight-dirty-markers')
    if (!entry) throw new Error('Dirty-marker backfill missing')
    const enqueued = await entry.trigger()
    if (isDeduplicatedEnqueue(enqueued)) return
    await expect(readEnqueuedJob(voteAggregation, enqueued)).resolves.toMatchObject({
      name: 'vote-aggregation.processVoteWeightDirtyMarkers',
      data: {},
    })
  })
})

function parseSourceTables(sourceTable: string): string[] {
  return sourceTable.split(',').map(source => source.trim())
}
