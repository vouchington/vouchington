import { read } from '@data-stores/psql'
import type {
  RssFeedDispatchCursor,
  RssFeedDispatchPage,
  RssFeedToFetch,
} from './get-to-fetch-types.mts'
import * as crawlConfig from './crawl-config.mts'
import type { RssFeedCrawlTier } from './crawl-config.mts'

const NIL_UUID = '00000000-0000-0000-0000-000000000000'
const MAX_UUID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

type HealthyRawRow = RssFeedToFetch & {
  dispatch_lane: number
  raw_id: string
  raw_last_fetch_succeeded_at: string | null
}

function extractSubMsMicros(iso: string): number {
  const match = /\.(\d{4,6})/.exec(iso)
  if (!match) return 0
  return Number(match[1]!.slice(3).padEnd(3, '0'))
}

function resolveHealthyBounds(
  lane: number,
  tier: RssFeedCrawlTier,
  asOf: Date,
  cursor?: RssFeedDispatchCursor,
): {
  lowerLastSucceededAt: string | Date
  lowerId: string
  upperLastSucceededAt: Date
  isEmptyRange: boolean
} {
  const tierSlaMs = crawlConfig.getTierSlaMs(tier)
  const dueCutoff = new Date(asOf.getTime() - tierSlaMs)
  if (lane <= 5) {
    return {
      lowerLastSucceededAt: cursor?.afterLastSucceededAt ?? '-infinity',
      lowerId: cursor?.afterId ?? NIL_UUID,
      upperLastSucceededAt: dueCutoff,
      isEmptyRange: false,
    }
  }
  const tier1SlaMs = crawlConfig.getTierSlaMs(1)
  const backfillCutoff = new Date(asOf.getTime() - tier1SlaMs)
  if (dueCutoff.getTime() >= backfillCutoff.getTime()) {
    return {
      lowerLastSucceededAt: dueCutoff,
      lowerId: MAX_UUID,
      upperLastSucceededAt: backfillCutoff,
      isEmptyRange: true,
    }
  }
  const afterTs = cursor?.afterLastSucceededAt
  const afterMs = typeof afterTs === 'string' ? Date.parse(afterTs) : Number.NaN
  const useCursor =
    typeof afterTs === 'string' &&
    (afterMs > dueCutoff.getTime() ||
      (afterMs === dueCutoff.getTime() && extractSubMsMicros(afterTs) > 0))
  return {
    lowerLastSucceededAt: useCursor ? afterTs : dueCutoff,
    lowerId: useCursor ? (cursor?.afterId ?? NIL_UUID) : MAX_UUID,
    upperLastSucceededAt: backfillCutoff,
    isEmptyRange: false,
  }
}

export async function getRssFeedsHealthy(
  limit: number,
  rawBudget: number,
  asOf: Date,
  lane: number,
  throughId: string,
  cursor?: RssFeedDispatchCursor,
): Promise<RssFeedDispatchPage> {
  const tier = (lane <= 5 ? lane : lane - 5) as RssFeedCrawlTier
  const { lowerLastSucceededAt, lowerId, upperLastSucceededAt, isEmptyRange } =
    resolveHealthyBounds(lane, tier, asOf, cursor)
  const nextLaneCursor =
    lane < 10 ? { nextCursor: { lane: lane + 1, afterId: NIL_UUID, throughId } } : {}
  if (isEmptyRange) {
    return { feeds: [], rawRowsRead: 0, ...nextLaneCursor }
  }
  const priorityGroup = lane <= 5 ? 1 : 2
  const eligibleLimit = Math.min(limit + 1, rawBudget)
  const query = `/* getRssFeedsHealthy */
    WITH bounded_walk AS NOT MATERIALIZED (
      SELECT
        s.rss_feed_id AS raw_id,
        COALESCE(s.last_fetch_succeeded_at, '-infinity'::timestamptz) AS sort_last_fetch_succeeded_at,
        to_char(s.last_fetch_succeeded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS raw_last_fetch_succeeded_at,
        s.last_fetch_succeeded_at,
        s.last_fetch_failed_at,
        s.crawl_tier
      FROM rss_feed_fetch_states s
      WHERE s.crawl_tier = $1::smallint
        AND (s.last_fetch_failed_at IS NULL
          OR s.last_fetch_failed_at < s.last_fetch_succeeded_at)
        AND COALESCE(s.last_fetch_succeeded_at, '-infinity'::timestamptz) <= $2::timestamptz
        AND (COALESCE(s.last_fetch_succeeded_at, '-infinity'::timestamptz), s.rss_feed_id) > ($3::timestamptz, $4::uuid)
        AND s.rss_feed_id <= $5::uuid
      ORDER BY COALESCE(s.last_fetch_succeeded_at, '-infinity'::timestamptz) ASC, s.rss_feed_id ASC
      LIMIT $6::int
    )
    SELECT
      bw.raw_id,
      bw.raw_last_fetch_succeeded_at,
      rss_feeds.id AS id,
      urls.url AS url,
      urls.hostname_id AS url_hostname_id,
      url_hostnames.is_crawlable AS crawlable,
      rss_feeds.title,
      rss_feeds.declared_language,
      rss_feeds.last_modified_at,
      rss_feeds.etag,
      bw.last_fetch_succeeded_at,
      bw.last_fetch_failed_at,
      rss_feeds.feed_type,
      rss_feeds.should_ignore_robots_txt AS feed_ignore_robots_txt,
      url_hostnames.should_ignore_robots_txt AS hostname_ignore_robots_txt,
      rss_feeds.unreliable_status_codes AS feed_unreliable_status_codes,
      url_hostnames.unreliable_status_codes AS hostname_unreliable_status_codes,
      COALESCE(t.crawl_score, 0) AS crawl_score,
      bw.crawl_tier,
      $7::int AS priority_group,
      $8::int AS dispatch_lane
    FROM bounded_walk bw
    JOIN rss_feeds ON rss_feeds.id = bw.raw_id
    JOIN urls ON urls.id = rss_feeds.rss_feed_url_id
    JOIN url_hostnames ON url_hostnames.id = urls.hostname_id
    LEFT JOIN mv_rss_feed_crawl_tiers t ON t.rss_feed_id = bw.raw_id
    WHERE (url_hostnames.network_backoff_ends_at IS NULL
        OR url_hostnames.network_backoff_ends_at <= CURRENT_TIMESTAMP)
      AND (url_hostnames.rate_limit_ends_at IS NULL
        OR url_hostnames.rate_limit_ends_at <= CURRENT_TIMESTAMP)
    ORDER BY bw.sort_last_fetch_succeeded_at ASC, bw.raw_id ASC
    LIMIT $9::int`

  const { rows } = await read<HealthyRawRow>(query, [
    tier,
    upperLastSucceededAt,
    lowerLastSucceededAt,
    lowerId,
    throughId,
    rawBudget,
    priorityGroup,
    lane,
    eligibleLimit,
  ])
  if (rows.length === 0) {
    const { rows: skippedRows } = await read<{ scanned: number }>(
      `/* countSkippedHealthyRssFeeds */
      SELECT COUNT(*)::int AS scanned
      FROM (
        SELECT 1
        FROM rss_feed_fetch_states s
        WHERE s.crawl_tier = $1::smallint
          AND (s.last_fetch_failed_at IS NULL
            OR s.last_fetch_failed_at < s.last_fetch_succeeded_at)
          AND COALESCE(s.last_fetch_succeeded_at, '-infinity'::timestamptz) <= $2::timestamptz
          AND (COALESCE(s.last_fetch_succeeded_at, '-infinity'::timestamptz), s.rss_feed_id) > ($3::timestamptz, $4::uuid)
          AND s.rss_feed_id <= $5::uuid
        ORDER BY COALESCE(s.last_fetch_succeeded_at, '-infinity'::timestamptz) ASC, s.rss_feed_id ASC
        LIMIT $6::int
      ) skipped`,
      [tier, upperLastSucceededAt, lowerLastSucceededAt, lowerId, throughId, rawBudget],
    )
    const scanned = skippedRows[0]?.scanned ?? 0
    return {
      feeds: [],
      rawRowsRead: scanned,
      ...(scanned < rawBudget ? nextLaneCursor : {}),
    }
  }
  const consumed = rows.slice(0, limit)
  const hasMoreInLane = rows.length > limit || (rawBudget <= limit && rows.length === limit)
  const lastConsumed = consumed.at(-1)
  return {
    feeds: consumed.map(row => {
      const { raw_id: _rawId, raw_last_fetch_succeeded_at: _rawSucceededAt, ...feed } = row
      return feed
    }),
    rawRowsRead: rows.length,
    ...(hasMoreInLane && lastConsumed
      ? {
          nextCursor: {
            lane,
            afterId: lastConsumed.raw_id,
            afterLastSucceededAt: lastConsumed.raw_last_fetch_succeeded_at,
            throughId,
          },
        }
      : nextLaneCursor),
  }
}
