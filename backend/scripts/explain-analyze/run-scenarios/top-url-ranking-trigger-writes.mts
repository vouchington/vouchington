import assert from 'node:assert/strict'
import { beginTransaction } from '@data-stores/psql'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  TOP_URL_FEED,
  TOP_URL_HOT,
  TOP_URL_INSERT_ITEM,
  TOP_URL_MOVE_TARGET,
} from '../seed-data/top-url-ranking.mts'

/** Exercise both trigger entry points with real writes, then restore the fixture by rollback. */
export async function captureTopUrlTriggerWrites(): Promise<void> {
  registerScenarioContract('top-url-insert-later-item', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'rss_feed_items', max: 1 },
      { kind: 'maxFunctionCalls', function: 'fn_update_url_latest_published_at', max: 1 },
      { kind: 'usesIndexes', indexes: ['urls_pkey'], queryContains: 'topUrlRanking.insertLatest' },
      { kind: 'maxProcessedRows', relation: 'urls', max: 1 },
    ],
  })
  await runAndCapture(
    'top-url-insert-later-item',
    async () => {
      await using query = await beginTransaction()
      const inserted = await query<{ id: string }>(
        `/* topUrlRanking.insertLater */ INSERT INTO rss_feed_items
       (id, url_id, data, gemini_embedding_2_content_sha256)
       VALUES ($1, $2, jsonb_build_object('title', 'Later top URL item',
         'isoDate', '2026-02-01T00:00:00Z'), decode(repeat('c3', 32), 'hex'))
       RETURNING id`,
        [TOP_URL_INSERT_ITEM, TOP_URL_HOT],
      )
      assert.equal(inserted.rows.length, 1)
      const { rows } = await query<{ latest_published_at: Date }>(
        `/* topUrlRanking.insertLatest */ SELECT latest_published_at FROM urls WHERE id = $1`,
        [TOP_URL_HOT],
      )
      assert.equal(rows[0]?.latest_published_at.toISOString(), '2026-02-01T00:00:00.000Z')
    },
    undefined,
    ['topUrlRanking.insertLater', 'topUrlRanking.insertLatest'],
  )

  const originalFeedUrl = TOP_URL_MOVE_TARGET
  registerScenarioContract('top-url-feed-move', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'rss_feeds', max: 2 },
      { kind: 'maxFunctionCalls', function: 'fn_update_url_feed_rank', max: 1 },
      { kind: 'usesIndexes', indexes: ['urls_pkey'], queryContains: 'topUrlRanking.feedRanks' },
      { kind: 'maxProcessedRows', relation: 'urls', max: 2 },
    ],
  })
  await runAndCapture(
    'top-url-feed-move',
    async () => {
      await using query = await beginTransaction()
      const moved = await query<{ id: string }>(
        `/* topUrlRanking.feedMove */ UPDATE rss_feeds SET rss_feed_url_id = $1
       WHERE id = $2 AND rss_feed_url_id = $3 AND is_enabled
         AND deleted_at IS NULL RETURNING id`,
        [TOP_URL_HOT, TOP_URL_FEED, originalFeedUrl],
      )
      assert.equal(moved.rows.length, 1)
      const { rows } = await query<{ id: string; feed_rank: number }>(
        `/* topUrlRanking.feedRanks */ SELECT id, feed_rank FROM urls
       WHERE id = ANY($1::uuid[]) ORDER BY id`,
        [[originalFeedUrl, TOP_URL_HOT]],
      )
      assert.equal(rows.length, 2)
      assert.equal(rows.find(row => row.id === originalFeedUrl)?.feed_rank, 1)
      assert.equal(rows.find(row => row.id === TOP_URL_HOT)?.feed_rank, 0)
    },
    undefined,
    ['topUrlRanking.feedMove', 'topUrlRanking.feedRanks'],
  )
}
