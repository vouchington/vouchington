import { read, type QueryOptions } from '@data-stores/psql'
import type { RssFeedToFetch } from './get-to-fetch.mts'
import { FEED_COLUMNS, FEED_JOINS } from './get-to-fetch-columns.mts'

type GetRssFeedByIdToFetchOptions = QueryOptions & { ttl?: number }

export async function getRssFeedByIdToFetch(
  rssFeedId: string,
  { ttl = 60_000, ...queryOptions }: GetRssFeedByIdToFetchOptions = {},
): Promise<RssFeedToFetch | null> {
  const params: unknown[] = [rssFeedId]
  const ttlFilter =
    ttl > 0
      ? `AND (rss_feeds.last_fetched_at IS NULL OR rss_feeds.last_fetched_at <= CURRENT_TIMESTAMP - ($2 * INTERVAL '1 millisecond'))`
      : ''
  if (ttl > 0) params.push(ttl)

  const query = `/* getRssFeedByIdToFetch */
    SELECT
${FEED_COLUMNS.slice(1)},
      0::DOUBLE PRECISION AS crawl_score,
      5::INT AS crawl_tier,
      1 AS priority_group
    FROM rss_feeds${FEED_JOINS}
    WHERE rss_feeds.id = $1
      AND rss_feeds.deleted_at IS NULL
      AND rss_feeds.is_enabled = TRUE
      ${ttlFilter}
    LIMIT 1`

  const { rows } = await read<RssFeedToFetch>(query, params, queryOptions)
  return rows[0] ?? null
}
