import assert from 'node:assert/strict'
import { beginTransaction, write, type QueryExecutor } from '@data-stores/psql'
import {
  postPublicationWorkConfig,
  postPublicationWorkMaxValues,
} from '@services/post-publication/work-limits'
import { hardDeleteRssFeedChildPage } from '@services/rss-feeds/hard-delete-child-page'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { cleanupRssWriteCapacity, seedRssWriteCapacity } from './rss-write-capacity-fixture.mts'

export async function runRssHardDeleteCrawlCapacityScenario(): Promise<void> {
  const scenario = 'rss-hard-delete-crawls-at-cap'
  const limit = postPublicationWorkMaxValues.rss_feed_hard_delete_capture_batch_size
  const fixture = await seedRssWriteCapacity()
  const unrelatedFixture = await seedRssWriteCapacity()
  const restoreLimit = overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, {
    rss_feed_hard_delete_capture_batch_size: limit,
  })
  try {
    const unrelatedIds = await seedCrawls(write, unrelatedFixture.feedId, 5)
    const ids = await seedPendingCrawls(fixture.feedId, limit + 1)
    const first = ids[0]!
    const last = ids.at(-1)!
    registerScenarioContract(scenario, {
      allowEmptyResult: true,
      expectations: [],
      crossPartition: {
        rss_feed_crawls: 'A deleted feed can have retained crawl rows in successive ID partitions.',
      },
    })
    await runAndCapture(
      scenario,
      async () => {
        const page = await hardDeleteRssFeedChildPage(fixture.feedId, 'crawls', first)
        assert.deepEqual(page, { removed: limit, hasMore: true })
      },
      undefined,
      ['hardDeleteRssFeedChildPage:crawls', 'hardDeleteRssFeedChildPage:deleteRows'],
      {
        afterCapture: async () => {
          assert.deepEqual(await remainingCrawlIds(fixture.feedId), [last])
          const continuation = await hardDeleteRssFeedChildPage(fixture.feedId, 'crawls', last)
          assert.deepEqual(continuation, { removed: 1, hasMore: false })
          assert.deepEqual(await remainingCrawlIds(fixture.feedId), [])
          assert.deepEqual(await remainingCrawlIds(unrelatedFixture.feedId), unrelatedIds)
          await seedPendingCrawls(fixture.feedId, limit + 1, ids)
        },
      },
    )
  } finally {
    restoreLimit()
    await cleanupRssWriteCapacity(fixture)
    await cleanupRssWriteCapacity(unrelatedFixture)
  }
}

async function remainingCrawlIds(feedId: string) {
  const { rows } = await write<{ id: string }>(
    `/* checkRssHardDeleteCrawlSurvivors */ SELECT id FROM rss_feed_crawls
      WHERE rss_feed_id = $1 AND id > $1 ORDER BY id`,
    [feedId],
  )
  return rows.map(row => row.id)
}

async function seedPendingCrawls(feedId: string, count: number, existingIds?: readonly string[]) {
  await using query = await beginTransaction()
  if (existingIds) {
    await query(
      `/* reopenRssHardDeleteCrawlFixture */ UPDATE rss_feeds
        SET deleted_at = NULL, hard_delete_requested_at = NULL WHERE id = $1`,
      [feedId],
    )
  }
  const ids = await seedCrawls(query, feedId, count, existingIds)
  await query(
    `/* markRssHardDeleteCrawlFixture */ UPDATE rss_feeds
      SET deleted_at = CURRENT_TIMESTAMP, hard_delete_requested_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [feedId],
  )
  await query.commit()
  return ids
}

async function seedCrawls(
  query: QueryExecutor,
  feedId: string,
  count: number,
  existingIds?: readonly string[],
) {
  const { rows } = await query<{ id: string }>(
    `/* seedRssHardDeleteCrawlFixture */ INSERT INTO rss_feed_crawls (id, rss_feed_id, response_code)
      SELECT COALESCE(($3::uuid[])[ordinal], uuidv7()), $1, 200
      FROM generate_series(1, $2::int) AS input(ordinal) RETURNING id`,
    [feedId, count, existingIds ?? null],
  )
  return rows.map(row => row.id).toSorted()
}
