import type { RunViewsOptions as PlatformRunViewsOptions } from '@vouchington/postgres/views'
import type { QueryExecutor, TransactionQuery } from '../types.mts'

export const SYNC_RSS_FEED_FETCH_STATE_TIERS_SQL = `/* syncRssFeedFetchStateCrawlTiers */
UPDATE rss_feed_fetch_states s
SET crawl_tier = next_tiers.crawl_tier
FROM (
  SELECT s2.rss_feed_id, COALESCE(t.crawl_tier, 5::smallint) AS crawl_tier
  FROM rss_feed_fetch_states s2
  LEFT JOIN mv_rss_feed_crawl_tiers t ON t.rss_feed_id = s2.rss_feed_id
  WHERE s2.crawl_tier IS DISTINCT FROM COALESCE(t.crawl_tier, 5::smallint)
) next_tiers
WHERE s.rss_feed_id = next_tiers.rss_feed_id`

export async function refreshRssFeedCrawlTiersInTransaction(tx: TransactionQuery): Promise<void> {
  await tx(
    '/* refreshMaterializedView */ REFRESH MATERIALIZED VIEW CONCURRENTLY "mv_rss_feed_crawl_tiers"',
  )
  await tx(SYNC_RSS_FEED_FETCH_STATE_TIERS_SQL)
}

export const CRAWL_TIERS_VIEW_CREATE_MARKER = 'CREATE MATERIALIZED VIEW mv_rss_feed_crawl_tiers'

export function createCrawlTiersSyncTransactionRunner(
  runInTx: <Result>(handler: (tx: QueryExecutor) => Promise<Result>) => Promise<Result>,
): NonNullable<PlatformRunViewsOptions['withTransaction']> {
  return execute =>
    runInTx(async tx => {
      let createdCrawlTiers = false
      const trackingWriter: QueryExecutor = (input, values) => {
        if (typeof input === 'string' && input.includes(CRAWL_TIERS_VIEW_CREATE_MARKER)) {
          createdCrawlTiers = true
        }
        return tx(input, values)
      }
      const result = await execute(trackingWriter)
      if (createdCrawlTiers) {
        await tx(SYNC_RSS_FEED_FETCH_STATE_TIERS_SQL)
      }
      return result
    })
}
