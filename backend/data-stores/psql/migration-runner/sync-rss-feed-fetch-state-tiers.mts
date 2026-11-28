import type { Pool, PoolClient } from 'pg'

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

export async function syncRssFeedFetchStateCrawlTiers(
  executor: Pick<Pool | PoolClient, 'query'>,
): Promise<void> {
  await executor.query(SYNC_RSS_FEED_FETCH_STATE_TIERS_SQL)
}
