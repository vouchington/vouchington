import { read } from '@data-stores/psql'
import { FEED_COLUMNS, FEED_JOINS } from './get-to-fetch-columns.mts'
import type { RssFeedToFetch } from './get-to-fetch-types.mts'
import * as crawlConfig from './crawl-config.mts'

export type { RssFeedToFetch } from './get-to-fetch-types.mts'

export type RssFeedDispatchCursor = { lane: number; afterId: string; throughId?: string }
type RssFeedDispatchCandidate = RssFeedToFetch & { dispatch_lane: number }
export type RssFeedDispatchPage = {
  feeds: RssFeedDispatchCandidate[]
  rawRowsRead: number
  nextCursor?: RssFeedDispatchCursor
}

type GetRssFeedsToFetchOptions = {
  limit?: number
  rawBudget?: number
  cursor?: RssFeedDispatchCursor
  asOf?: Date
}

async function getRssFeedsTiered(
  limit: number,
  rawBudget: number,
  asOf: Date,
  cursor?: RssFeedDispatchCursor,
): Promise<RssFeedDispatchPage> {
  const tier1_sla_ms = crawlConfig.getTierSlaMs(1)
  const tier2_sla_ms = crawlConfig.getTierSlaMs(2)
  const tier3_sla_ms = crawlConfig.getTierSlaMs(3)
  const tier4_sla_ms = crawlConfig.getTierSlaMs(4)
  const tier5_sla_ms = crawlConfig.getTierSlaMs(5)

  const lane = cursor?.lane ?? 1
  if (!Number.isSafeInteger(lane) || lane < 1 || lane > 10)
    throw new RangeError('Invalid RSS dispatch lane')
  const tier = lane <= 5 ? lane : lane - 5
  const throughId =
    cursor?.throughId ??
    (
      await read<{ id: string }>(
        `/* getRssFeedDispatchUpperId */ SELECT id FROM rss_feeds ORDER BY id DESC LIMIT 1`,
      )
    ).rows[0]?.id
  if (!throughId) return { feeds: [], rawRowsRead: 0 }
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

  const isDueExpr = `(rss_feeds.last_fetched_at IS NULL OR rss_feeds.last_fetched_at <= $6::timestamptz - (${slaCaseExpr}))`

  const enabledWhere = `rss_feeds.deleted_at IS NULL
      AND rss_feeds.is_enabled = TRUE
      AND (url_hostnames.network_backoff_ends_at IS NULL
        OR url_hostnames.network_backoff_ends_at <= CURRENT_TIMESTAMP)`

  const rawSource =
    tier === 5
      ? `SELECT id FROM rss_feeds
       WHERE deleted_at IS NULL AND is_enabled = TRUE
         AND id > $7::uuid AND id <= $11::uuid
       ORDER BY id LIMIT $9`
      : `SELECT rss_feed_id AS id FROM mv_rss_feed_crawl_tiers
       WHERE crawl_tier = $8::int AND rss_feed_id > $7::uuid
         AND rss_feed_id <= $11::uuid
       ORDER BY rss_feed_id LIMIT $9`
  const priorityExpr = `CASE WHEN ${isDueExpr} THEN 1 ELSE 2 END`
  const dispatchLaneExpr = `CASE WHEN ${isDueExpr} THEN ${tierExpr} ELSE ${tierExpr} + 5 END`
  const query = `/* getRssFeedsTiered */
    WITH raw_page AS MATERIALIZED (${rawSource})
    SELECT raw_page.id AS raw_id,
      ranked.id, url, url_hostname_id, crawlable, title,
      declared_language, last_modified_at, etag, last_fetched_at, feed_type,
      feed_ignore_robots_txt, hostname_ignore_robots_txt,
      feed_unreliable_status_codes, hostname_unreliable_status_codes,
      crawl_score, crawl_tier, priority_group, dispatch_lane
    FROM raw_page LEFT JOIN LATERAL (
      SELECT${FEED_COLUMNS},
        ${scoreExpr} AS crawl_score,
        ${tierExpr} AS crawl_tier,
        ${priorityExpr} AS priority_group,
        ${dispatchLaneExpr} AS dispatch_lane
      FROM rss_feeds${FEED_JOINS}
      LEFT JOIN mv_rss_feed_crawl_tiers t ON t.rss_feed_id = rss_feeds.id
      WHERE rss_feeds.id = raw_page.id AND ${enabledWhere}
        AND ${tierExpr} = $8::int
        AND (${isDueExpr}
          OR rss_feeds.last_fetched_at <= $6::timestamptz - ($1::BIGINT * INTERVAL '1 millisecond'))
        AND ${dispatchLaneExpr} = $10::int
      LIMIT 1
    ) ranked ON TRUE
    ORDER BY raw_page.id ASC`

  const params: unknown[] = [
    tier1_sla_ms,
    tier2_sla_ms,
    tier3_sla_ms,
    tier4_sla_ms,
    tier5_sla_ms,
    asOf,
    cursor?.afterId ?? '00000000-0000-0000-0000-000000000000',
    tier,
    Math.min(limit + 1, rawBudget),
    lane,
    throughId,
  ]
  const { rows } = await read<
    (RssFeedDispatchCandidate & { raw_id: string }) | { raw_id: string; id: null }
  >(query, params)
  const consumed = rows.slice(0, limit)
  const hasMoreInLane = rows.length > limit || (rawBudget <= limit && rows.length === limit)
  return {
    feeds: consumed.flatMap(row => {
      if (row.id === null) return []
      const { raw_id: _rawId, ...feed } = row
      return [feed]
    }),
    rawRowsRead: rows.length,
    ...(hasMoreInLane
      ? { nextCursor: { lane, afterId: consumed.at(-1)!.raw_id, throughId } }
      : lane < 10
        ? {
            nextCursor: {
              lane: lane + 1,
              afterId: '00000000-0000-0000-0000-000000000000',
              throughId,
            },
          }
        : {}),
  }
}

export function getRssFeedsToFetch({
  limit,
  rawBudget,
  cursor,
  asOf = new Date(),
}: GetRssFeedsToFetchOptions = {}): Promise<RssFeedDispatchPage> {
  const capacityBudget = crawlConfig.getCrawlCapacityBudget()
  const budget = Math.min(limit ?? capacityBudget, capacityBudget)
  const asOfMs = asOf.getTime()
  if (!Number.isFinite(asOfMs)) throw new RangeError('Invalid RSS tier scheduling time')
  const physicalBudget = Math.min(rawBudget ?? capacityBudget, capacityBudget)
  if (!Number.isSafeInteger(physicalBudget) || physicalBudget < 1)
    throw new RangeError('RSS raw budget must be a positive safe integer')
  return getRssFeedsTiered(
    Math.min(budget, physicalBudget),
    physicalBudget,
    new Date(asOfMs),
    cursor,
  )
}

export { getRssFeedByIdToFetch } from './get-by-id-to-fetch.mts'
