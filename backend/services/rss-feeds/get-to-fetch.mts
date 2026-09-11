import { read } from '@data-stores/psql'
import * as crawlConfig from './crawl-config.mts'

export type RssFeedToFetch = {
  id: string
  url: string
  url_hostname_id: string
  crawlable: boolean | null
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

type GetRssFeedsToFetchOptions = {
  ttl?: number
  limit?: number
  // Lets the dispatcher thread one config decision through selection and enqueueing.
  prioritized?: boolean
}

const FEED_COLUMNS = `
      rss_feeds.id,
      urls.url AS url,
      urls.hostname_id AS url_hostname_id,
      url_hostnames.crawlable AS crawlable,
      rss_feeds.title,
      rss_feeds.declared_language,
      rss_feeds.last_modified_at,
      rss_feeds.etag,
      rss_feeds.last_fetched_at,
      rss_feeds.feed_type,
      rss_feeds.ignore_robots_txt AS feed_ignore_robots_txt,
      url_hostnames.ignore_robots_txt AS hostname_ignore_robots_txt,
      rss_feeds.unreliable_status_codes AS feed_unreliable_status_codes,
      url_hostnames.unreliable_status_codes AS hostname_unreliable_status_codes`

const FEED_JOINS = `
    JOIN urls ON urls.id = rss_feeds.rss_feed_url_id
    JOIN url_hostnames ON url_hostnames.id = urls.hostname_id`

async function getRssFeedsFlatTtl(options: {
  rssFeedId?: string
  ttl: number
  limit?: number
}): Promise<RssFeedToFetch[]> {
  const { rssFeedId, ttl, limit } = options
  const params: unknown[] = []
  let paramIndex = 1

  let where = `    WHERE rss_feeds.deleted_at IS NULL
      AND rss_feeds.is_enabled = TRUE\n`

  if (rssFeedId) {
    where += `      AND rss_feeds.id = $${paramIndex}\n`
    params.push(rssFeedId)
    paramIndex++
  }

  if (ttl > 0) {
    where += `      AND (rss_feeds.last_fetched_at IS NULL OR rss_feeds.last_fetched_at <= CURRENT_TIMESTAMP - ($${paramIndex} * INTERVAL '1 millisecond'))\n`
    params.push(ttl)
    paramIndex++
  }

  let limitClause = ''
  if (limit !== undefined) {
    limitClause = `    LIMIT $${paramIndex}\n`
    params.push(limit)
  }

  const query = `/* getRssFeedsFlatTtl */
    SELECT${FEED_COLUMNS},
      0::DOUBLE PRECISION AS crawl_score,
      5::INT AS crawl_tier,
      1 AS priority_group
    FROM rss_feeds${FEED_JOINS}
${where}    ORDER BY rss_feeds.last_fetched_at ASC NULLS FIRST, rss_feeds.id ASC
${limitClause}`

  const { rows } = await read<RssFeedToFetch>(query, params)
  return rows
}

async function getRssFeedsTiered(limit: number): Promise<RssFeedToFetch[]> {
  const tier1_sla_ms = crawlConfig.getTierSlaMs(1)
  const tier2_sla_ms = crawlConfig.getTierSlaMs(2)
  const tier3_sla_ms = crawlConfig.getTierSlaMs(3)
  const tier4_sla_ms = crawlConfig.getTierSlaMs(4)
  const tier5_sla_ms = crawlConfig.getTierSlaMs(5)

  const tierExpr = `COALESCE(t.crawl_tier, 5)`
  const scoreExpr = `COALESCE(t.crawl_score, 0)`

  // SLA deadline expression: NOW() - (tier_sla_ms * INTERVAL '1 millisecond')
  // Cast params to BIGINT so PostgreSQL accepts numeric * interval without a type error.
  const slaCaseExpr = `CASE ${tierExpr}
        WHEN 1 THEN $1::BIGINT
        WHEN 2 THEN $2::BIGINT
        WHEN 3 THEN $3::BIGINT
        WHEN 4 THEN $4::BIGINT
        ELSE $5::BIGINT
      END * INTERVAL '1 millisecond'`

  const isDueExpr = `(rss_feeds.last_fetched_at IS NULL OR rss_feeds.last_fetched_at <= CURRENT_TIMESTAMP - (${slaCaseExpr}))`

  const enabledWhere = `rss_feeds.deleted_at IS NULL
      AND rss_feeds.is_enabled = TRUE`

  const query = `/* getRssFeedsTiered */
    WITH due AS (
      SELECT${FEED_COLUMNS},
        ${scoreExpr} AS crawl_score,
        ${tierExpr} AS crawl_tier,
        1 AS priority_group,
        NULL::TIMESTAMPTZ AS deadline_at
      FROM rss_feeds${FEED_JOINS}
      LEFT JOIN mv_rss_feed_crawl_tiers t ON t.rss_feed_id = rss_feeds.id
      WHERE ${enabledWhere}
        AND ${isDueExpr}
    ),
    backfill AS (
      SELECT${FEED_COLUMNS},
        ${scoreExpr} AS crawl_score,
        ${tierExpr} AS crawl_tier,
        2 AS priority_group,
        (rss_feeds.last_fetched_at + (${slaCaseExpr})) AS deadline_at
      FROM rss_feeds${FEED_JOINS}
      LEFT JOIN mv_rss_feed_crawl_tiers t ON t.rss_feed_id = rss_feeds.id
      WHERE ${enabledWhere}
        AND NOT ${isDueExpr}
        AND rss_feeds.last_fetched_at <= CURRENT_TIMESTAMP - ($1::BIGINT * INTERVAL '1 millisecond')
    )
    SELECT
      id, url, url_hostname_id, crawlable, title,
      declared_language, last_modified_at, etag, last_fetched_at, feed_type,
      feed_ignore_robots_txt, hostname_ignore_robots_txt,
      feed_unreliable_status_codes, hostname_unreliable_status_codes,
      crawl_score, crawl_tier, priority_group
    FROM (
      SELECT * FROM due
      UNION ALL
      SELECT * FROM backfill
    ) combined
    ORDER BY
      priority_group ASC,
      deadline_at ASC NULLS FIRST,
      crawl_score DESC,
      id ASC
    LIMIT $6`

  const params: unknown[] = [
    tier1_sla_ms,
    tier2_sla_ms,
    tier3_sla_ms,
    tier4_sla_ms,
    tier5_sla_ms,
    limit,
  ]

  const { rows } = await read<RssFeedToFetch>(query, params)
  return rows
}

export function getRssFeedsToFetch({
  ttl = 60_000,
  limit,
  prioritized,
}: GetRssFeedsToFetchOptions = {}): Promise<RssFeedToFetch[]> {
  const usePrioritized = prioritized ?? crawlConfig.isCrawlPrioritizationEnabled()
  if (!usePrioritized) {
    return getRssFeedsFlatTtl({ ttl, limit: limit ?? 100 })
  }

  const capacityBudget = crawlConfig.getCrawlCapacityBudget()
  const budget = limit === undefined ? capacityBudget : Math.min(limit, capacityBudget)
  return getRssFeedsTiered(budget)
}

type GetRssFeedByIdToFetchOptions = {
  ttl?: number
}

export async function getRssFeedByIdToFetch(
  rssFeedId: string,
  { ttl = 60_000 }: GetRssFeedByIdToFetchOptions = {},
): Promise<RssFeedToFetch | null> {
  const rows = await getRssFeedsFlatTtl({ rssFeedId, ttl, limit: 1 })
  return rows[0] ?? null
}
