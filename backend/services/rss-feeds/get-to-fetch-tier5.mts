import { read } from '@data-stores/psql'
import type {
  RssFeedDispatchCursor,
  RssFeedDispatchPage,
  RssFeedToFetch,
} from './get-to-fetch-types.mts'
import * as crawlConfig from './crawl-config.mts'

const NIL_UUID = '00000000-0000-0000-0000-000000000000'
const MAX_UUID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

type Tier5RawRow =
  | (RssFeedToFetch & {
      dispatch_lane: number
      raw_id: string
      raw_last_fetch_succeeded_at: string | null
    })
  | { raw_id: string; raw_last_fetch_succeeded_at: string | null; id: null }

function extractSubMsMicros(iso: string): number {
  const match = /\.(\d{4,6})/.exec(iso)
  if (!match) return 0
  return Number(match[1]!.slice(3).padEnd(3, '0'))
}

function resolveTier5Bounds(
  lane: 5 | 10,
  asOf: Date,
  cursor?: RssFeedDispatchCursor,
): { lowerLastSucceededAt: string | Date; lowerId: string; upperLastSucceededAt: Date } {
  const tier1SlaMs = crawlConfig.getTierSlaMs(1)
  const tier5SlaMs = crawlConfig.getTierSlaMs(5)
  const dueCutoff = new Date(asOf.getTime() - tier5SlaMs)
  if (lane === 5) {
    return {
      lowerLastSucceededAt: cursor?.afterLastFetchedAt ?? '-infinity',
      lowerId: cursor?.afterId ?? NIL_UUID,
      upperLastSucceededAt: dueCutoff,
    }
  }
  const backfillCutoff = new Date(asOf.getTime() - tier1SlaMs)
  const afterTs = cursor?.afterLastFetchedAt
  const afterMs = typeof afterTs === 'string' ? Date.parse(afterTs) : Number.NaN
  const useCursor =
    typeof afterTs === 'string' &&
    (afterMs > dueCutoff.getTime() ||
      (afterMs === dueCutoff.getTime() && extractSubMsMicros(afterTs) > 0))
  return {
    lowerLastSucceededAt: useCursor ? afterTs : dueCutoff,
    lowerId: useCursor ? (cursor?.afterId ?? NIL_UUID) : MAX_UUID,
    upperLastSucceededAt: backfillCutoff,
  }
}

export async function getRssFeedsTier5(
  limit: number,
  rawBudget: number,
  asOf: Date,
  lane: 5 | 10,
  throughId: string,
  cursor?: RssFeedDispatchCursor,
): Promise<RssFeedDispatchPage> {
  const { lowerLastSucceededAt, lowerId, upperLastSucceededAt } = resolveTier5Bounds(
    lane,
    asOf,
    cursor,
  )
  const priorityGroup = lane === 5 ? 1 : 2
  const query = `/* getRssFeedsTier5 */
    WITH raw_page AS MATERIALIZED (
      SELECT
        s.rss_feed_id AS raw_id,
        COALESCE(s.last_fetch_succeeded_at, '-infinity'::timestamptz) AS sort_last_fetch_succeeded_at,
        to_char(s.last_fetch_succeeded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS raw_last_fetch_succeeded_at,
        s.last_fetch_succeeded_at,
        s.last_fetch_failed_at
      FROM rss_feed_fetch_states s
      WHERE (s.last_fetch_failed_at IS NULL
          OR s.last_fetch_failed_at < s.last_fetch_succeeded_at)
        AND COALESCE(s.last_fetch_succeeded_at, '-infinity'::timestamptz) <= $1::timestamptz
        AND (COALESCE(s.last_fetch_succeeded_at, '-infinity'::timestamptz), s.rss_feed_id) > ($2::timestamptz, $3::uuid)
        AND s.rss_feed_id <= $4::uuid
      ORDER BY COALESCE(s.last_fetch_succeeded_at, '-infinity'::timestamptz) ASC, s.rss_feed_id ASC
      LIMIT $5
    )
    SELECT
      raw_page.raw_id,
      raw_page.raw_last_fetch_succeeded_at,
      ranked.id, ranked.url, ranked.url_hostname_id, ranked.crawlable,
      ranked.title, ranked.declared_language, ranked.last_modified_at,
      ranked.etag, raw_page.last_fetch_succeeded_at, raw_page.last_fetch_failed_at,
      ranked.feed_type,
      ranked.feed_ignore_robots_txt, ranked.hostname_ignore_robots_txt,
      ranked.feed_unreliable_status_codes, ranked.hostname_unreliable_status_codes,
      ranked.crawl_score, ranked.crawl_tier, ranked.priority_group, ranked.dispatch_lane
    FROM raw_page
    LEFT JOIN LATERAL (
      SELECT
        rss_feeds.id AS id,
        urls.url AS url,
        urls.hostname_id AS url_hostname_id,
        url_hostnames.is_crawlable AS crawlable,
        rss_feeds.title,
        rss_feeds.declared_language,
        rss_feeds.last_modified_at,
        rss_feeds.etag,
        rss_feeds.feed_type,
        rss_feeds.should_ignore_robots_txt AS feed_ignore_robots_txt,
        url_hostnames.should_ignore_robots_txt AS hostname_ignore_robots_txt,
        rss_feeds.unreliable_status_codes AS feed_unreliable_status_codes,
        url_hostnames.unreliable_status_codes AS hostname_unreliable_status_codes,
        COALESCE(t.crawl_score, 0) AS crawl_score,
        COALESCE(t.crawl_tier, 5) AS crawl_tier,
        $6::int AS priority_group,
        $7::int AS dispatch_lane
      FROM rss_feeds
      JOIN urls ON urls.id = rss_feeds.rss_feed_url_id
      JOIN url_hostnames ON url_hostnames.id = urls.hostname_id
      LEFT JOIN mv_rss_feed_crawl_tiers t ON t.rss_feed_id = rss_feeds.id
      WHERE rss_feeds.id = raw_page.raw_id
        AND (url_hostnames.network_backoff_ends_at IS NULL
          OR url_hostnames.network_backoff_ends_at <= CURRENT_TIMESTAMP)
        AND (url_hostnames.rate_limit_ends_at IS NULL
          OR url_hostnames.rate_limit_ends_at <= CURRENT_TIMESTAMP)
        AND COALESCE(t.crawl_tier, 5) = 5
      LIMIT 1
    ) ranked ON TRUE
    ORDER BY raw_page.sort_last_fetch_succeeded_at ASC, raw_page.raw_id ASC`

  const { rows } = await read<Tier5RawRow>(query, [
    upperLastSucceededAt,
    lowerLastSucceededAt,
    lowerId,
    throughId,
    Math.min(limit + 1, rawBudget),
    priorityGroup,
    lane,
  ])
  const consumed = rows.slice(0, limit)
  const hasMoreInLane = rows.length > limit || (rawBudget <= limit && rows.length === limit)
  const lastConsumed = consumed.at(-1)
  return {
    feeds: consumed.flatMap(row => {
      if (row.id === null) return []
      const { raw_id: _rawId, raw_last_fetch_succeeded_at: _rawSucceededAt, ...feed } = row
      return [feed]
    }),
    rawRowsRead: rows.length,
    ...(hasMoreInLane && lastConsumed
      ? {
          nextCursor: {
            lane,
            afterId: lastConsumed.raw_id,
            afterLastFetchedAt: lastConsumed.raw_last_fetch_succeeded_at,
            throughId,
          },
        }
      : lane < 10
        ? { nextCursor: { lane: lane + 1, afterId: NIL_UUID, throughId } }
        : {}),
  }
}
