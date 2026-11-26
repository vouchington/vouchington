import assert from 'node:assert/strict'
import { beginTransaction, write } from '@data-stores/psql'
import { getRssFeedItemCategorySnapshotPage } from '@services/rss-feed-items/source-category-union'
import { getRssFeedItemsWorkLimit } from '@services/rss-feed-items/work-limits'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import type { RssWriteCapacityFixture } from './rss-write-capacity-fixture.mts'

export async function runRssCategorySnapshotSourcePages(fixture: RssWriteCapacityFixture) {
  const limit = getRssFeedItemsWorkLimit('category_snapshot_reconciliation_batch_size')
  const itemId = fixture.itemIds.at(-1)!
  const tailFeedId = await seedSourcePages(fixture, itemId, limit)
  try {
    await captureSourcePage('rss-category-source-first-at-cap', itemId, null, [], {
      categories: ['first alpha', 'first beta'],
      afterFeedId: fixture.feedId,
    })
    await captureSourcePage(
      'rss-category-source-after-at-cap',
      itemId,
      fixture.feedId,
      ['first alpha', 'first beta'],
      { categories: ['first alpha', 'first beta', 'tail only'], afterFeedId: null },
    )
  } finally {
    await write('/* cleanupRssCategorySourceTail */ DELETE FROM rss_feeds WHERE id = $1', [
      tailFeedId,
    ])
  }
}

async function captureSourcePage(
  scenario: string,
  itemId: string,
  afterFeedId: string | null,
  accumulated: readonly string[],
  expected: Awaited<ReturnType<typeof getRssFeedItemCategorySnapshotPage>>,
) {
  registerScenarioContract(scenario, { expectations: [] })
  await runAndCapture(
    scenario,
    async () =>
      assert.deepEqual(
        await getRssFeedItemCategorySnapshotPage(itemId, afterFeedId, accumulated),
        expected,
      ),
    undefined,
    'getRssFeedItemCategorySnapshotPage',
  )
}

async function seedSourcePages(fixture: RssWriteCapacityFixture, itemId: string, limit: number) {
  await using query = await beginTransaction()
  const { rows: head } = await query<{ id: string }>(
    `/* selectRssCategorySourceHead */ SELECT id FROM rss_feeds
     WHERE id < $1 AND deleted_at IS NULL ORDER BY id LIMIT $2`,
    [fixture.feedId, limit - 1],
  )
  assert.equal(head.length, limit - 1)
  await query(
    `/* seedDeletedRssCategorySource */ UPDATE rss_feeds SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [fixture.feedId],
  )
  // A live replacement can reuse the removed feed's owned URL and topic.
  const { rows: tail } = await query<{ id: string }>(
    `/* seedRssCategorySourceTail */ INSERT INTO rss_feeds (rss_feed_url_id, topic_id, created_via)
     VALUES ($1, $2, 'system') RETURNING id`,
    [fixture.urlId, fixture.feedTopicId],
  )
  const tailId = tail[0]!.id
  assert.ok(tailId > fixture.feedId)
  const feedIds = [...head.map(row => row.id), fixture.feedId, tailId]
  await query(
    `/* seedRssCategorySourcePages */ WITH sources AS (
       INSERT INTO rss_feed_item_sources (rss_feed_id, rss_feed_item_id)
       SELECT id, $1 FROM unnest($2::uuid[]) AS feed(id)
       ON CONFLICT (rss_feed_id, rss_feed_item_id) DO NOTHING
     )
     INSERT INTO rss_feed_item_source_category_snapshots (rss_feed_id, rss_feed_item_id, categories)
     SELECT feed_id, $1, categories FROM unnest($2::uuid[], $3::jsonb[]) AS input(feed_id, categories)`,
    [
      itemId,
      feedIds,
      [
        ...head.map((_, index) => JSON.stringify([index % 2 === 0 ? 'first alpha' : 'first beta'])),
        JSON.stringify(['deleted only']),
        JSON.stringify(['first alpha', 'tail only']),
      ],
    ],
  )
  await query.commit()
  return tailId
}
