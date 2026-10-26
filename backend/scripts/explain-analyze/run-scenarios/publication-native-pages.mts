import assert from 'node:assert/strict'
import { beginTransaction, getCapturedQueries } from '@data-stores/psql'
import { listFeedRows } from '@services/post-publication/identity-feed-paging'
import { listPublicationIdentitySourcePage } from '@services/post-publication/identity-source-paging'
import { createTestPublicationSnapshotWork } from '@voucha/test-helpers/post-publication-fixtures'
import {
  insertTestPublicationTopicSlugFanout,
  insertTestPublicationFeedFanout,
} from '@voucha/test-helpers/entities/post-publication-snapshots'
import {
  insertTestPublicationSourceLessFeedItems,
  insertTestPublicationAdditionalFeedItems,
} from '@voucha/test-helpers/entities/post-publication-feed-pages'
import {
  analyzePublicationSlugPageForTest,
  analyzePublicationFeedItemPageForTest,
  explainSparsePublicationFeedSourcesForTest,
  publicationPhysicalRowsWithinBudget as physicalRows,
  publicationMatchesRelation as matchesRelation,
  publicationScanIndexes as scanIndexes,
} from '@voucha/test-helpers/entities/post-publication-query-plans'
import { collectPlanNodes } from '@voucha/test-helpers/query-plans'
import { getResults, runAndCapture } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'

export async function runPublicationNativePageScenarios(): Promise<void> {
  const slug = await createTestPublicationSnapshotWork()
  const fixtures = await insertTestPublicationTopicSlugFanout(slug.candidate.id, slug.user.id, 1001)
  await runAndCapture(
    'publication-native-slug-page',
    async () => {
      await using query = await beginTransaction()
      await listPublicationIdentitySourcePage(
        query,
        slug.candidate.id,
        'slug',
        fixtures.slugs[500]!,
        100,
      )
    },
    undefined,
    'listPostPublicationIdentityNativeSourcePage',
    { afterCapture: analyzePublicationSlugPageForTest },
  )
  for (const { plan } of getResults().filter(
    result => result.scenario_id === 'publication-native-slug-page',
  )) {
    assert.equal(physicalRows(plan, 'post_slugs'), 100)
    assert.ok(scanIndexes(plan, 'post_slugs').includes('idx_post_slugs__post_id_slug'))
    assert.ok(
      collectPlanNodes(plan).some(
        node =>
          node['Relation Name'] === 'post_slugs' && String(node['Index Cond']).includes('post_id'),
      ),
    )
  }

  const feed = await createTestPublicationSnapshotWork()
  const { topicIds } = await insertTestPublicationTopicSlugFanout(
    feed.candidate.id,
    feed.user.id,
    1,
  )
  const feeds = await insertTestPublicationFeedFanout(feed.candidate.id, feed.user.id, topicIds)
  await insertTestPublicationSourceLessFeedItems(feed.candidate.id, 1001)
  const unrelated = await createTestPublicationSnapshotWork()
  const topics = await insertTestPublicationTopicSlugFanout(
    unrelated.candidate.id,
    unrelated.user.id,
    1,
  )
  const unrelatedFeeds = await insertTestPublicationFeedFanout(
    unrelated.candidate.id,
    unrelated.user.id,
    topics.topicIds,
  )
  await insertTestPublicationAdditionalFeedItems(unrelated.candidate.id, unrelatedFeeds[0]!, 1001)
  await runAndCapture(
    'publication-sparse-feed-page',
    () => captureFeedPage(feed.candidate.id),
    undefined,
    'listPublicationIdentityFeedItem',
    {
      afterCapture: async () => {
        const queries = getCapturedQueries().filter(query =>
          query.text.startsWith('/* listPublicationIdentityFeedItem */'),
        )
        assert.equal(queries.length, 1)
        const custom = await explainSparsePublicationFeedSourcesForTest(
          queries[0]!,
          'force_custom_plan',
        )
        const generic = await explainSparsePublicationFeedSourcesForTest(
          queries[0]!,
          'force_generic_plan',
        )
        for (const { plan, cardinality } of [custom, generic]) {
          assert.equal(physicalRows(plan, 'rss_feed_items'), 100)
          const scans = collectPlanNodes(plan).filter(node =>
            matchesRelation(node, 'rss_feed_item_sources'),
          )
          const loops = scans.reduce((total, node) => total + Number(node['Actual Loops'] ?? 0), 0)
          assert.ok(loops <= 100)
          const sourceRows = scans.some(node => node['Node Type'] === 'Seq Scan')
            ? cardinality * loops
            : physicalRows(plan, 'rss_feed_item_sources')
          assert.ok(sourceRows <= 100, `Sparse source probes visited ${sourceRows} rows`)
        }
      },
    },
  )
  await insertTestPublicationAdditionalFeedItems(feed.candidate.id, feeds[0]!, 1001, true)
  await runAndCapture(
    'publication-feed-item-page',
    () => captureFeedPage(feed.candidate.id),
    undefined,
    'listPublicationIdentityFeedItem',
    { afterCapture: analyzePublicationFeedItemPageForTest },
  )
  for (const { plan } of getResults().filter(
    result => result.scenario_id === 'publication-feed-item-page',
  )) {
    assert.equal(physicalRows(plan, 'rss_feed_items'), 100)
    physicalRows(plan, 'rss_feed_item_sources')
    assert.ok(
      collectPlanNodes(plan)
        .filter(node => matchesRelation(node, 'rss_feed_item_sources'))
        .reduce((total, node) => total + Number(node['Actual Loops'] ?? 0), 0) <= 100,
    )
    for (const [relation, scope] of [
      ['rss_feed_items', 'story_id'],
      ['rss_feed_item_sources', 'rss_feed_item_id'],
    ]) {
      assert.ok(
        collectPlanNodes(plan).some(
          node =>
            matchesRelation(node, relation!) &&
            typeof node['Index Name'] === 'string' &&
            String(node['Index Cond']).includes(scope!),
        ),
      )
    }
  }
}

async function captureFeedPage(postId: string): Promise<void> {
  await using query = await beginTransaction()
  await listFeedRows(query, postId, null, 100)
}

registerScenarioContract('publication-native-slug-page', {
  expectations: [
    { kind: 'maxProcessedRows', relation: 'post_slugs', max: 100 },
    { kind: 'usesIndexes', indexes: ['idx_post_slugs__post_id_slug'] },
  ],
})
for (const id of ['publication-feed-item-page', 'publication-sparse-feed-page']) {
  registerScenarioContract(id, {
    allowEmptyResult: id === 'publication-sparse-feed-page',
    expectations: [
      { kind: 'maxProcessedRows', relation: 'rss_feed_items', max: 100 },
      { kind: 'maxProcessedRows', relation: 'rss_feed_item_sources', max: 100 },
    ],
  })
}
