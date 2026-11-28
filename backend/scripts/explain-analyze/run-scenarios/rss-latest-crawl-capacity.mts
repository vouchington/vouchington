import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { getLatestRssFeedCrawlForFeedWithOptions } from '@services/rss-feeds/crawls'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid, seedUuidAtTimestamp } from '../seed-data/common.mts'

export async function runRssLatestCrawlCapacityScenario(): Promise<void> {
  const scenario = 'rss-latest-successful-crawl-at-cap'
  const feedId = seedUuid(50, '08')
  const failureCount = 600
  const now = Date.now()
  const successIds = [seedUuidAtTimestamp(now - 2_000, 10), seedUuidAtTimestamp(now - 1_000, 11)]
  const failedIds = Array.from({ length: failureCount }, (_, index) =>
    seedUuidAtTimestamp(now, 1_700_000 + index),
  )
  const unrelated = Array.from({ length: 2_500 }, (_, index) => ({
    id: seedUuidAtTimestamp(now, 2_710_000 + index),
    feed: seedUuid(60 + (index % 50), '08'),
  }))
  const expectedSha = Buffer.alloc(32, 11)
  const expectedPayload = { sequence: 2 }
  const ids = [...successIds, ...failedIds, ...unrelated.map(row => row.id)]
  await write(sql`/* seedExplainLatestRssFeedCrawl */
    INSERT INTO rss_feed_crawls (id, rss_feed_id, response_code, feed_data, feed_data_sha256)
    SELECT entry.id, entry.feed, CASE WHEN entry.id = ANY(${failedIds}::uuid[]) THEN 503 ELSE 200 END,
      CASE WHEN entry.id = ${successIds[1]!}::uuid THEN ${JSON.stringify(expectedPayload)}::jsonb
        WHEN NOT (entry.id = ANY(${failedIds}::uuid[])) THEN jsonb_build_object('sequence', 1) END,
      CASE WHEN entry.id = ${successIds[1]!}::uuid THEN ${expectedSha}::bytea
        WHEN NOT (entry.id = ANY(${failedIds}::uuid[])) THEN decode(repeat('01', 32), 'hex') END
    FROM unnest(
      ${ids}::uuid[],
      ${[...successIds, ...failedIds].map(() => feedId).concat(unrelated.map(row => row.feed))}::uuid[]
    ) AS entry(id, feed)`)
  try {
    await write('/* analyzeExplainLatestRssFeedCrawl */ ANALYZE rss_feed_crawls')
    registerScenarioContract(scenario, {
      seededRows: { rss_feed_crawls: ids.length },
      forbidSequentialScans: ['rss_feed_crawls'],
      crossPartition: {
        rss_feed_crawls: 'The last successful crawl can precede the newest history partition.',
      },
      expectations: [
        { kind: 'maxProcessedRows', relation: 'rss_feed_crawls', max: 1 },
        { kind: 'maxInputRows', nodeType: 'Sort', max: 0 },
      ],
    })
    await runAndCapture(
      scenario,
      async () => {
        const [summary, payload] = await Promise.all([
          getLatestRssFeedCrawlForFeedWithOptions(feedId, { includeFeedData: false }),
          getLatestRssFeedCrawlForFeedWithOptions(feedId, { includeFeedData: true }),
        ])
        assert.deepEqual(summary, { feed_data: null, feed_data_sha256: expectedSha })
        assert.deepEqual(payload, { feed_data: expectedPayload, feed_data_sha256: expectedSha })
      },
      undefined,
      'getLatestRssFeedCrawlForFeed',
    )
  } finally {
    await write(sql`/* cleanupExplainLatestRssFeedCrawl */
      DELETE FROM rss_feed_crawls WHERE id = ANY(${ids}::uuid[])`)
  }
}
