import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { encodeScopedUuidCursor } from '@modules/pagination'
import { searchRssFeedCrawls } from '@services/rss-feeds/crawls'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { crawlSeedUuid, seedUuid } from '../seed-data/common.mts'

const PAGE_SIZE = 100
const TARGET_CRAWL_COUNT = PAGE_SIZE * 2 + 1
const BACKGROUND_CRAWL_COUNT = 500
const CRAWL_ID_BASE = 20_000
const CRAWL_ID_TABLE_TAG = '41'

export async function runRssFeedCrawlCapacityScenario(): Promise<void> {
  const feedId = seedUuid(0, '08')
  const targetIds = Array.from({ length: TARGET_CRAWL_COUNT }, (_, index) =>
    crawlSeedUuid(CRAWL_ID_BASE + index, CRAWL_ID_TABLE_TAG),
  )
  const backgroundIds = Array.from({ length: BACKGROUND_CRAWL_COUNT }, (_, index) =>
    crawlSeedUuid(CRAWL_ID_BASE + TARGET_CRAWL_COUNT + index, CRAWL_ID_TABLE_TAG),
  )
  const backgroundFeedIds = Array.from({ length: BACKGROUND_CRAWL_COUNT }, (_, index) =>
    seedUuid(1 + (index % 25), '08'),
  )
  const allIds = [...targetIds, ...backgroundIds]

  await write(sql`/* seedRssFeedCrawlCapacity */
    INSERT INTO rss_feed_crawls (id, rss_feed_id, response_code)
    SELECT fixture.id, fixture.feed_id, 200
    FROM unnest(
      ${targetIds}::uuid[] || ${backgroundIds}::uuid[],
      ${targetIds.map(() => feedId)}::uuid[] || ${backgroundFeedIds}::uuid[]
    ) AS fixture(id, feed_id)`)

  try {
    await write('/* analyzeRssFeedCrawlCapacity */ ANALYZE rss_feed_crawls')
    const orderedTargetIds = targetIds.toSorted().toReversed()
    const cursorScope = `rss-feed:${feedId}:crawls`
    const after = encodeScopedUuidCursor(orderedTargetIds[0]!, cursorScope)
    const expectedFirstPage = orderedTargetIds.slice(1, PAGE_SIZE + 1)
    const expectedLastPage = orderedTargetIds.slice(PAGE_SIZE + 1)
    registerScenarioContract('rss-feed-crawls-at-page-cap', {
      expectations: [
        // #6413 tracks sorting all in-range crawls before the page limit.
        { kind: 'maxProcessedRows', relation: 'rss_feed_crawls', max: 200 },
      ],
      seededRows: { rss_feed_crawls: allIds.length },
      crossPartition: {
        rss_feed_crawls: 'A feed can have crawl history in more than one arrival-time partition.',
      },
    })
    await runAndCapture(
      'rss-feed-crawls-at-page-cap',
      async () => {
        const first = await searchRssFeedCrawls(feedId, { after, limit: PAGE_SIZE })
        assert.deepEqual(
          first.results.map(crawl => crawl.id),
          expectedFirstPage,
        )
        assert.deepEqual(first.page_info, {
          has_next_page: true,
          start_cursor: encodeScopedUuidCursor(expectedFirstPage[0]!, cursorScope),
          end_cursor: encodeScopedUuidCursor(expectedFirstPage.at(-1)!, cursorScope),
        })
        const last = await searchRssFeedCrawls(feedId, {
          after: first.page_info.end_cursor!,
          limit: PAGE_SIZE,
        })
        assert.deepEqual(
          last.results.map(crawl => crawl.id),
          expectedLastPage,
        )
        assert.deepEqual(last.page_info, {
          has_next_page: false,
          start_cursor: encodeScopedUuidCursor(expectedLastPage[0]!, cursorScope),
          end_cursor: null,
        })
      },
      undefined,
      'searchRssFeedCrawls',
      { exactCapturedNames: ['searchRssFeedCrawls', 'searchRssFeedCrawls'] },
    )
  } finally {
    await write(sql`/* deleteRssFeedCrawlCapacity */
      DELETE FROM rss_feed_crawls WHERE id = ANY(${allIds}::uuid[])`)
  }
}
