import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import { RECENTLY_VIEWED_ZSET_LIMIT } from '@services/recently-viewed'
import { filterRssFeedItemIdsByMediaType } from '@services/rss-feed-items/get-batch'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import type { RssWriteCapacityFixture } from './rss-write-capacity-fixture.mts'

export async function runRecentlyViewedRssItemTypeScenario({ itemIds }: RssWriteCapacityFixture) {
  const [audioId, deletedId, articleId] = itemIds
  assert.ok(audioId && deletedId && articleId)
  await write(
    `/* seedRecentlyViewedRssItemTypes */
      UPDATE rss_feed_items
      SET media_type = CASE WHEN id = $1 THEN 'audio'::rss_feed_item_media_types ELSE media_type END,
          deleted_at = CASE WHEN id = $2 THEN CURRENT_TIMESTAMP ELSE deleted_at END
      WHERE id IN ($1, $2)`,
    [audioId, deletedId],
  )
  const { rows } = await write<{ id: string }>(
    `/* selectRecentlyViewedArticleItems */ SELECT id FROM rss_feed_items
      WHERE deleted_at IS NULL AND media_type = 'article' AND id <> ALL($1::uuid[])
      ORDER BY id LIMIT $2`,
    [itemIds, RECENTLY_VIEWED_ZSET_LIMIT - 4],
  )
  const matches = new Set([articleId, ...rows.map(row => row.id)])
  const ids = [audioId, deletedId, randomUUID(), ...matches]
  assert.equal(ids.length, RECENTLY_VIEWED_ZSET_LIMIT)
  const scenario = 'recently-viewed-rss-item-types-at-cap'
  registerScenarioContract(scenario, { expectations: [] })
  await runAndCapture(
    scenario,
    async () => assert.deepEqual(await filterRssFeedItemIdsByMediaType(ids, 'article'), matches),
    undefined,
    'filterRssFeedItemIdsByMediaType',
  )
}
