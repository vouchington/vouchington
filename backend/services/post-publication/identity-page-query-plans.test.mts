import { beforeAll, describe, expect, it } from 'vitest'
import {
  beginTransaction,
  enableQueryCapture,
  stopTestQueryCapture,
  explainCapturedTestQuery,
  collectPlanNodes,
  type CapturedTestQuery,
} from '@voucha/test-helpers'
import {
  analyzePublicationSlugPageForTest,
  analyzePublicationSnapshotKeyPageForTest,
  analyzePublicationCleanupPageForTest,
  analyzePublicationFeedItemPageForTest,
  explainSparsePublicationFeedSourcesForTest,
  publicationPhysicalRowsWithinBudget as physicalRows,
  publicationMatchesRelation as matchesRelation,
  publicationScanIndexes as scanIndexes,
  insertTestPublicationSnapshotHeaderFanout,
} from '@voucha/test-helpers/entities/post-publication-query-plans'
import {
  insertTestPublicationTopicSlugFanout,
  insertTestPublicationFeedFanout,
} from '@voucha/test-helpers/entities/post-publication-snapshots'
import {
  insertTestPublicationSourceLessFeedItems,
  insertTestPublicationAdditionalFeedItems,
} from '@voucha/test-helpers/entities/post-publication-feed-pages'
import { listFeedRows } from './identity-feed-paging.mts'
import { createTestPublicationSnapshotWork } from './test-fixtures.mts'
import { listPublicationIdentitySourcePage } from './identity-source-paging.mts'
import { materializePostPublicationIdentitySnapshot } from './identity-snapshots.mts'
import { acknowledgePostPublicationProjectionReceipts } from './receipts.mts'
import { retainStoredPublicationIdentityPage } from './retain-stored-identities.mts'
import { cleanupPostPublicationIdentitySnapshots } from './snapshot-cleanup.mts'

let slugQuery: CapturedTestQuery
let snapshotQuery: CapturedTestQuery
let cleanupQuery: CapturedTestQuery
let cleanupLockQuery: CapturedTestQuery
let feedItemQuery: CapturedTestQuery
const sparseFeedPlans = new Map<string, { plan: unknown; cardinality: number }>()

describe('publication identity physical page query plans', () => {
  beforeAll(async () => {
    const { work, candidate, user } = await createTestPublicationSnapshotWork()
    const fixtures = await insertTestPublicationTopicSlugFanout(candidate.id, user.id, 1001)
    slugQuery = await captureAnnotatedQuery(
      'listPostPublicationIdentityNativeSourcePage',
      async () => {
        await using query = await beginTransaction()
        await listPublicationIdentitySourcePage(
          query,
          candidate.id,
          'slug',
          fixtures.slugs[500]!,
          100,
        )
      },
    )
    let snapshot = await materializePostPublicationIdentitySnapshot(work, candidate, 100)
    const noise = await createTestPublicationSnapshotWork()
    await insertTestPublicationTopicSlugFanout(noise.candidate.id, noise.user.id, 1001)
    await materializePostPublicationIdentitySnapshot(noise.work, noise.candidate, 1000)
    for (let page = 0; page < 30 && !snapshot.complete; page += 1)
      snapshot = await materializePostPublicationIdentitySnapshot(work, candidate, 100)
    if (!snapshot.complete) throw new Error('Expected complete high-fanout plan fixture')
    candidate.identity_snapshot_id = snapshot.snapshotId
    if (!(await acknowledgePostPublicationProjectionReceipts(work, [candidate])))
      throw new Error('Expected accepted snapshot fixture')
    await using retention = await beginTransaction()
    const first = await retainStoredPublicationIdentityPage(
      retention,
      work.id,
      candidate.id,
      null,
      null,
      100,
    )
    snapshotQuery = await captureAnnotatedQuery(
      'listStoredPublicationSnapshotNativePage',
      async () => {
        await retainStoredPublicationIdentityPage(
          retention,
          work.id,
          candidate.id,
          first.cursorKind,
          first.cursorValue,
          100,
        )
      },
    )
    await retention.commit()
    await insertTestPublicationSnapshotHeaderFanout({
      workId: work.id,
      generation: work.generation,
      postId: candidate.id,
      count: 1001,
    })
    cleanupQuery = await captureAnnotatedQuery(
      'listPublicationSnapshotCleanupHeaderPage',
      async () => {
        await cleanupPostPublicationIdentitySnapshots(100)
      },
    )
    cleanupLockQuery = await captureAnnotatedQuery(
      'lockPublicationSnapshotCleanupHeaderPage',
      async () => {
        await cleanupPostPublicationIdentitySnapshots(100)
      },
    )
    const feedFixture = await createTestPublicationSnapshotWork()
    const { topicIds } = await insertTestPublicationTopicSlugFanout(
      feedFixture.candidate.id,
      feedFixture.user.id,
      1,
    )
    const feedIds = await insertTestPublicationFeedFanout(
      feedFixture.candidate.id,
      feedFixture.user.id,
      topicIds,
    )
    await insertTestPublicationSourceLessFeedItems(feedFixture.candidate.id, 1001)
    feedItemQuery = await captureAnnotatedQuery('listPublicationIdentityFeedItem', async () => {
      await using query = await beginTransaction()
      await listFeedRows(query, feedFixture.candidate.id, null, 100)
    })
    for (const mode of ['force_custom_plan', 'force_generic_plan'] as const) {
      sparseFeedPlans.set(
        mode,
        await explainSparsePublicationFeedSourcesForTest(feedItemQuery, mode),
      )
    }
    await insertTestPublicationAdditionalFeedItems(
      feedFixture.candidate.id,
      feedIds[0]!,
      1001,
      true,
    )
    const unrelated = await createTestPublicationSnapshotWork()
    const unrelatedTopics = await insertTestPublicationTopicSlugFanout(
      unrelated.candidate.id,
      unrelated.user.id,
      1,
    )
    const unrelatedFeeds = await insertTestPublicationFeedFanout(
      unrelated.candidate.id,
      unrelated.user.id,
      unrelatedTopics.topicIds,
    )
    await insertTestPublicationAdditionalFeedItems(unrelated.candidate.id, unrelatedFeeds[0]!, 1001)
  })

  it.each(['force_custom_plan', 'force_generic_plan'] as const)(
    'bounds sparse source probes in %s without rounded per-loop overcounts',
    mode => {
      const { plan, cardinality } = sparseFeedPlans.get(mode)!
      expect(physicalRows(plan, 'rss_feed_items')).toBe(100)
      const scans = collectPlanNodes(plan).filter(node =>
        matchesRelation(node, 'rss_feed_item_sources'),
      )
      const loops = scans.reduce((total, node) => total + Number(node['Actual Loops'] ?? 0), 0)
      expect(loops).toBeLessThanOrEqual(100)
      const sourceRows = scans.some(node => node['Node Type'] === 'Seq Scan')
        ? cardinality * loops
        : physicalRows(plan, 'rss_feed_item_sources')
      expect(sourceRows).toBeLessThanOrEqual(100)
    },
  )
  it.each(['force_custom_plan', 'force_generic_plan'] as const)(
    'bounds native item candidates and source existence probes in %s',
    async mode => {
      const plan = await explainCapturedTestQuery(
        'publication-feed-item-page',
        feedItemQuery,
        mode,
        analyzePublicationFeedItemPageForTest,
      )
      expect(physicalRows(plan, 'rss_feed_items')).toBe(100)
      expect(physicalRows(plan, 'rss_feed_item_sources')).toBeLessThanOrEqual(100)
      expect(
        collectPlanNodes(plan)
          .filter(node => matchesRelation(node, 'rss_feed_item_sources'))
          .reduce((probes, node) => probes + Number(node['Actual Loops'] ?? 0), 0),
      ).toBeLessThanOrEqual(100)
      for (const [relation, scope] of [
        ['rss_feed_items', 'story_id'],
        ['rss_feed_item_sources', 'rss_feed_item_id'],
      ]) {
        expect(
          collectPlanNodes(plan).some(
            node =>
              matchesRelation(node, relation!) &&
              typeof node['Index Name'] === 'string' &&
              String(node['Index Cond']).includes(scope!),
          ),
        ).toBe(true)
      }
    },
  )
  it.each(['force_custom_plan', 'force_generic_plan'] as const)(
    'seeks native slugs before LIMIT in %s',
    async mode => {
      const plan = await explainCapturedTestQuery(
        'publication-native-slug-page',
        slugQuery,
        mode,
        analyzePublicationSlugPageForTest,
      )
      expect(physicalRows(plan, 'post_slugs')).toBe(100)
      expect(scanIndexes(plan, 'post_slugs')).toContain('idx_post_slugs__post_id_slug')
      expect(
        collectPlanNodes(plan).some(
          node =>
            node['Relation Name'] === 'post_slugs' &&
            String(node['Index Cond']).includes('post_id'),
        ),
      ).toBe(true)
    },
  )
  it.each(['force_custom_plan', 'force_generic_plan'] as const)(
    'seeks typed receipt keys before LIMIT in %s',
    async mode => {
      const plan = await explainCapturedTestQuery(
        'publication-typed-receipt-page',
        snapshotQuery,
        mode,
        analyzePublicationSnapshotKeyPageForTest,
      )
      expect(physicalRows(plan, 'post_publication_identity_snapshot_keys')).toBe(100)
      const scopedSeeks = collectPlanNodes(plan).filter(
        node =>
          node['Relation Name'] === 'post_publication_identity_snapshot_keys' &&
          typeof node['Index Name'] === 'string' &&
          String(node['Index Cond']).includes('snapshot_id'),
      )
      expect(scopedSeeks).toHaveLength(2)
    },
  )
  it.each(['force_custom_plan', 'force_generic_plan'] as const)(
    'bounds each candidate header lock probe in %s',
    async mode => {
      const plan = await explainCapturedTestQuery(
        'publication-cleanup-lock-page',
        cleanupLockQuery,
        mode,
        analyzePublicationCleanupPageForTest,
      )
      expect(physicalRows(plan, 'post_publication_identity_snapshots')).toBeLessThanOrEqual(100)
      expect(scanIndexes(plan, 'post_publication_identity_snapshots')).toContain(
        'post_publication_identity_snapshots_pkey',
      )
    },
  )
  it.each(['force_custom_plan', 'force_generic_plan'] as const)(
    'caps headers before ownership probes in %s',
    async mode => {
      const plan = await explainCapturedTestQuery(
        'publication-cleanup-header-page',
        cleanupQuery,
        mode,
        analyzePublicationCleanupPageForTest,
      )
      expect(physicalRows(plan, 'post_publication_identity_snapshots')).toBe(100)
      expect(scanIndexes(plan, 'post_publication_identity_snapshots')).toContain(
        'post_publication_identity_snapshots_pkey',
      )
    },
  )
})

async function captureAnnotatedQuery(
  annotation: string,
  run: () => Promise<void>,
): Promise<CapturedTestQuery> {
  enableQueryCapture()
  let queries: CapturedTestQuery[] = []
  try {
    await run()
  } finally {
    queries = stopTestQueryCapture()
  }
  const selected = queries.filter(query => query.text.startsWith(`/* ${annotation} */`))
  if (selected.length !== 1)
    throw new Error(`Expected one actual ${annotation} query, got ${selected.length}`)
  return selected[0]!
}
