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
export type RssFeedDispatchPage = {
  feeds: RssFeedDispatchCandidate[]
  scannedCount: number
  nextCursor?: RssFeedDispatchCursor
}

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
): Promise<RssFeedDispatchPage> {
  const scanLimit = crawlConfig.getSelectionScanPageSize()
  const lane = cursor?.lane ?? 1
  if (!Number.isInteger(lane) || lane < 1 || lane > 10)
    throw new RangeError('Invalid RSS dispatch lane')
  const afterId = cursor?.afterId ?? '00000000-0000-0000-0000-000000000000'
  const tier1_sla_ms = crawlConfig.getTierSlaMs(1)
  const tier2_sla_ms = crawlConfig.getTierSlaMs(2)
  const tier3_sla_ms = crawlConfig.getTierSlaMs(3)
  const tier4_sla_ms = crawlConfig.getTierSlaMs(4)
  const tier5_sla_ms = crawlConfig.getTierSlaMs(5)

  const tierExpr = `COALESCE(t.crawl_tier, 5)`
  const scoreExpr = `COALESCE(t.crawl_score, 0)`

  // Cast params to BIGINT so PostgreSQL accepts numeric * interval without a type error.
  const slaCaseExpr = `CASE ${tierExpr}
        WHEN 1 THEN $4::BIGINT
        WHEN 2 THEN $5::BIGINT
        WHEN 3 THEN $6::BIGINT
        WHEN 4 THEN $7::BIGINT
        ELSE $8::BIGINT
      END * INTERVAL '1 millisecond'`

  const isDueExpr = `(rss_feeds.last_fetched_at IS NULL OR rss_feeds.last_fetched_at <= $3::timestamptz - (${slaCaseExpr}))`
  const isBackfillExpr = `rss_feeds.last_fetched_at <= $3::timestamptz - ($4::BIGINT * INTERVAL '1 millisecond')`

  const query = `/* getRssFeedsTiered */
    WITH raw AS MATERIALIZED (
      SELECT id, rss_feed_url_id, title, declared_language, last_modified_at,
        etag, last_fetched_at, feed_type, should_ignore_robots_txt,
        unreliable_status_codes, deleted_at, is_enabled
      FROM rss_feeds WHERE id > $1::uuid ORDER BY id LIMIT $2::integer
    )
    SELECT${FEED_COLUMNS}, ${scoreExpr} AS crawl_score, ${tierExpr} AS crawl_tier,
      CASE WHEN ${isDueExpr} THEN 1 WHEN ${isBackfillExpr} THEN 2 ELSE NULL END AS priority_group,
      CASE WHEN ${isDueExpr} THEN ${tierExpr}
           WHEN ${isBackfillExpr} THEN ${tierExpr} + 5 ELSE NULL END AS dispatch_lane,
      rss_feeds.deleted_at, rss_feeds.is_enabled
    FROM raw rss_feeds
    LEFT JOIN LATERAL (
      SELECT url, hostname_id FROM urls
      WHERE id = rss_feeds.rss_feed_url_id LIMIT 1
    ) urls ON TRUE
    LEFT JOIN url_hostnames ON url_hostnames.id = urls.hostname_id
    LEFT JOIN LATERAL (
      SELECT crawl_tier, crawl_score FROM mv_rss_feed_crawl_tiers
      WHERE rss_feed_id = rss_feeds.id LIMIT 1
    ) t ON TRUE
    ORDER BY rss_feeds.id`

  const params: unknown[] = [
    afterId,
    scanLimit + 1,
    asOf,
    tier1_sla_ms,
    tier2_sla_ms,
    tier3_sla_ms,
    tier4_sla_ms,
    tier5_sla_ms,
  ]

  const { rows } = await read<
    RssFeedDispatchCandidate & { deleted_at: Date | null; is_enabled: boolean }
  >(query, params)
  const feeds: RssFeedDispatchCandidate[] = []
  let scannedCount = 0
  for (const feed of rows.slice(0, scanLimit)) {
    scannedCount += 1
    if (
      feed.deleted_at === null &&
      feed.is_enabled &&
      feed.url != null &&
      feed.url_hostname_id != null &&
      feed.dispatch_lane === lane
    ) {
      feeds.push(feed)
    }
    if (feeds.length === limit) break
  }
  const lastRawId = rows[scannedCount - 1]?.id
  const nextCursor =
    rows.length > scannedCount && lastRawId
      ? { lane, afterId: lastRawId }
      : lane < 10
        ? { lane: lane + 1, afterId: '00000000-0000-0000-0000-000000000000' }
        : undefined
  return {
    feeds,
    scannedCount,
    ...(nextCursor && { nextCursor }),
  }
}

export function getRssFeedsToFetch({
  limit,
  cursor,
  asOf = new Date(),
}: GetRssFeedsToFetchOptions = {}): Promise<RssFeedDispatchPage> {
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
