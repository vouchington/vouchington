import { SEEDED_ROWS_BY_RELATION } from '../plan-seeded-rows.mts'
import assert from 'node:assert/strict'
import { listHardDeleteRssFeedNextPages } from '@services/rss-feeds/hard-delete-next-page'
import { listPendingRssFeedHardDeletes } from '@services/rss-feeds/hard-delete-recovery'
import { getPostPublicationWorkLimit } from '@services/post-publication/work-limits'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { PUBLICATION_SCOPE_SEED as seed } from '../seed-data/publication-scope-pages.mts'
import { preparePublicationHardDeletePlans } from '../seed-data/publication-scope-maintenance.mts'

/** Actual current selectors over the isolated hot feed/category corpus. */
export async function capturePublicationHardDeleteScenarios(): Promise<void> {
  await preparePublicationHardDeletePlans()
  registerScenarioContract('publication-rss-delete-next-page', {
    crossPartition: {
      rss_feed_crawls:
        'Deletion must find the earliest surviving crawl across retained history partitions. The feed UUID lower bound prunes older ranges; ordered LIMIT 1 stops at the first match, with indexed feed/id probes in the remaining leaves.',
    },
    seededRows: {
      rss_feed_categories: SEEDED_ROWS_BY_RELATION.rss_feed_categories! + seed.count * 2 + 1,
      rss_feeds: SEEDED_ROWS_BY_RELATION.rss_feeds! + seed.negativeFeedCount + 2,
    },
    expectations: [
      { kind: 'usesIndexes', indexes: ['rss_feed_categories_pkey'] },
      { kind: 'maxProcessedRows', relation: 'rss_feed_categories', max: 1 },
      { kind: 'maxProcessedRows', relation: 'rss_feed_item_sources', max: 1 },
      { kind: 'maxProcessedRows', relation: 'rss_feed_setting_changes', max: 1 },
      { kind: 'maxProcessedRows', relation: 'rss_feed_crawls', max: 1 },
      { kind: 'maxProcessedRows', relation: 'community_list_rss_feeds', max: 1 },
      { kind: 'maxProcessedRows', relation: 'curated_aside_items', max: 1 },
      { kind: 'maxProcessedRows', relation: 'user_import_requests', max: 1 },
      { kind: 'maxProcessedRows', relation: 'user_rss_feed_import_rows', max: 1 },
      { kind: 'maxProcessedRows', relation: 'rss_feeds', max: 2 },
    ],
  })
  await runAndCapture('publication-rss-delete-next-page', async () => {
    const [page] = await listHardDeleteRssFeedNextPages([seed.descriptorFeed])
    assert.equal(page?.phase, 'feed_categories')
    assert.ok(page.cursor)
  })
  const limit = getPostPublicationWorkLimit('rss_feed_hard_delete_capture_batch_size')
  registerScenarioContract('publication-rss-delete-recovery-page', {
    expectations: [
      { kind: 'custom', name: 'rssHardDeleteRecoverySeek' },
      { kind: 'usesIndexes', indexes: ['idx_rss_feeds__hard_delete_pending_id'], noSort: true },
      { kind: 'maxProcessedRows', relation: 'rss_feeds', max: limit },
    ],
  })
  await runAndCapture('publication-rss-delete-recovery-page', async () => {
    const ids = await listPendingRssFeedHardDeletes(seed.author)
    assert.ok(ids.includes(seed.feed))
    assert.ok(ids.length <= limit)
  })
}
