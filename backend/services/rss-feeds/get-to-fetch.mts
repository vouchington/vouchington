import { read, type QueryOptions } from '@data-stores/psql'
import * as crawlConfig from './crawl-config.mts'

export type RssFeedToFetch = {
  id: string
  url: string
  url_hostname_id: string
  crawlable: boolean
  title: string | null
  declared_language: string | null
  last_modified_at: Date | null
  etag: string | null
  last_fetched_at: Date | null
  feed_type: 'article' | 'podcast' | 'video' | 'mixed'
  feed_ignore_robots_txt: boolean | null
  hostname_ignore_robots_txt: boolean | null
  feed_unreliable_status_codes: number[] | null
  hostname_unreliable_status_codes: number[] | null
  crawl_score: number
  crawl_tier: number
  priority_group: 1 | 2
}

export type RssFeedDispatchCursor = { lane: number; afterId: string }
export type RssFeedDispatchCandidate = RssFeedToFetch & { dispatch_lane: number }

type GetRssFeedsToFetchOptions = {
  limit?: number
  cursor?: RssFeedDispatchCursor
  asOf?: Date
}

const FEED_COLUMNS = `
      rss_feeds.id,
      urls.url AS url,
      urls.hostname_id AS url_hostname_id,
      url_hostnames.is_crawlable AS crawlable,
      rss_feeds.title,
      rss_feeds.declared_language,
      rss_feeds.last_modified_at,
      rss_feeds.etag,
      rss_feeds.last_fetched_at,
      rss_feeds.feed_type,
      rss_feeds.should_ignore_robots_txt AS feed_ignore_robots_txt,
      url_hostnames.should_ignore_robots_txt AS hostname_ignore_robots_txt,
      rss_feeds.unreliable_status_codes AS feed_unreliable_status_codes,
      url_hostnames.unreliable_status_codes AS hostname_unreliable_status_codes`

const FEED_JOINS = `
    JOIN urls ON urls.id = rss_feeds.rss_feed_url_id
    JOIN url_hostnames ON url_hostnames.id = urls.hostname_id`

async function getRssFeedsTiered(
  limit: number,
  asOf: Date,
  cursor?: RssFeedDispatchCursor,
): Promise<RssFeedDispatchCandidate[]> {
  const tier1_sla_ms = crawlConfig.getTierSlaMs(1)
  const tier2_sla_ms = crawlConfig.getTierSlaMs(2)
  const tier3_sla_ms = crawlConfig.getTierSlaMs(3)
  const tier4_sla_ms = crawlConfig.getTierSlaMs(4)
  const tier5_sla_ms = crawlConfig.getTierSlaMs(5)

  const tierExpr = `COALESCE(t.crawl_tier, 5)`
  const scoreExpr = `COALESCE(t.crawl_score, 0)`

  // Cast params to BIGINT so PostgreSQL accepts numeric * interval without a type error.
  const slaCaseExpr = `CASE ${tierExpr}
        WHEN 1 THEN $1::BIGINT
        WHEN 2 THEN $2::BIGINT
        WHEN 3 THEN $3::BIGINT
        WHEN 4 THEN $4::BIGINT
        ELSE $5::BIGINT
      END * INTERVAL '1 millisecond'`

  const isDueExpr = `(rss_feeds.last_fetched_at IS NULL OR rss_feeds.last_fetched_at <= $7::timestamptz - (${slaCaseExpr}))`

  const enabledWhere = `rss_feeds.deleted_at IS NULL
      AND rss_feeds.is_enabled = TRUE
      AND (url_hostnames.network_backoff_ends_at IS NULL
        OR url_hostnames.network_backoff_ends_at <= CURRENT_TIMESTAMP)`

  const query = `/* getRssFeedsTiered */
    WITH candidates AS (
      SELECT${FEED_COLUMNS},
        ${scoreExpr} AS crawl_score,
        ${tierExpr} AS crawl_tier,
        CASE WHEN ${isDueExpr} THEN 1 ELSE 2 END AS priority_group
      FROM rss_feeds${FEED_JOINS}
      LEFT JOIN mv_rss_feed_crawl_tiers t ON t.rss_feed_id = rss_feeds.id
      WHERE ${enabledWhere}
        AND (${isDueExpr}
          OR rss_feeds.last_fetched_at <= $7::timestamptz - ($1::BIGINT * INTERVAL '1 millisecond'))
    ), ranked AS (
      SELECT *, CASE WHEN priority_group = 1 THEN crawl_tier ELSE crawl_tier + 5 END AS dispatch_lane
      FROM candidates
    )
    SELECT
      id, url, url_hostname_id, crawlable, title,
      declared_language, last_modified_at, etag, last_fetched_at, feed_type,
      feed_ignore_robots_txt, hostname_ignore_robots_txt,
      feed_unreliable_status_codes, hostname_unreliable_status_codes,
      crawl_score, crawl_tier, priority_group, dispatch_lane
    FROM ranked
    WHERE ($8::int IS NULL OR (dispatch_lane, id) > ($8::int, $9::uuid))
    -- Due tiers precede every backfill tier. Within a lane only the immutable id is a cursor:
    -- deadline and crawl_score can change between continuation jobs.
    ORDER BY dispatch_lane ASC, id ASC
    LIMIT $6`

  const params: unknown[] = [
    tier1_sla_ms,
    tier2_sla_ms,
    tier3_sla_ms,
    tier4_sla_ms,
    tier5_sla_ms,
    limit,
    asOf,
    cursor?.lane ?? null,
    cursor?.afterId ?? null,
  ]

  const { rows } = await read<RssFeedDispatchCandidate>(query, params)
  return rows
}

export function getRssFeedsToFetch({
  limit,
  cursor,
  asOf = new Date(),
}: GetRssFeedsToFetchOptions = {}): Promise<RssFeedDispatchCandidate[]> {
  const capacityBudget = crawlConfig.getCrawlCapacityBudget()
  const budget = Math.min(limit ?? capacityBudget, capacityBudget)
  const asOfMs = asOf.getTime()
  if (!Number.isFinite(asOfMs)) throw new RangeError('Invalid RSS tier scheduling time')
  return getRssFeedsTiered(budget, new Date(asOfMs), cursor)
}

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
