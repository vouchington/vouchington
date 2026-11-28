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
  raw_pos: number
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
) {
  const dueCutoff = new Date(asOf.getTime() - crawlConfig.getTierSlaMs(tier))
  if (lane <= 5) {
    return {
      lowerLastSucceededAt: cursor?.afterLastSucceededAt ?? '-infinity',
      lowerId: cursor?.afterId ?? NIL_UUID,
      upperLastSucceededAt: dueCutoff,
    }
  }
  const backfillCutoff = new Date(asOf.getTime() - crawlConfig.getTierSlaMs(1))
  if (dueCutoff.getTime() >= backfillCutoff.getTime()) return null
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
  const bounds = resolveHealthyBounds(lane, tier, asOf, cursor)
  const nextLaneCursor =
    lane < 10 ? { nextCursor: { lane: lane + 1, afterId: NIL_UUID, throughId } } : {}
  if (!bounds) return { feeds: [], rawRowsRead: 0, ...nextLaneCursor }
  const { lowerLastSucceededAt, lowerId, upperLastSucceededAt } = bounds
  const priorityGroup = lane <= 5 ? 1 : 2
  const eligibleLimit = Math.min(limit + 1, rawBudget)
  const query = `/* getRssFeedsHealthy */
    WITH bounded_walk AS NOT MATERIALIZED (
      SELECT
        ROW_NUMBER() OVER (ORDER BY COALESCE(s.last_fetch_succeeded_at, '-infinity'::timestamptz) ASC, s.rss_feed_id ASC)::int AS raw_pos,
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
      bw.raw_pos, bw.raw_id, bw.raw_last_fetch_succeeded_at,
      feed.id, feed.url, feed.url_hostname_id, feed.crawlable,
      feed.title, feed.declared_language, feed.last_modified_at, feed.etag,
      bw.last_fetch_succeeded_at, bw.last_fetch_failed_at,
      feed.feed_type, feed.feed_ignore_robots_txt, feed.hostname_ignore_robots_txt,
      feed.feed_unreliable_status_codes, feed.hostname_unreliable_status_codes,
      feed.crawl_score, bw.crawl_tier,
      $7::int AS priority_group, $8::int AS dispatch_lane
    FROM bounded_walk bw
    JOIN LATERAL (
      SELECT
        rss_feeds.id AS id, urls.url AS url, urls.hostname_id AS url_hostname_id,
        url_hostnames.is_crawlable AS crawlable, rss_feeds.title, rss_feeds.declared_language,
        rss_feeds.last_modified_at, rss_feeds.etag, rss_feeds.feed_type,
        rss_feeds.should_ignore_robots_txt AS feed_ignore_robots_txt,
        url_hostnames.should_ignore_robots_txt AS hostname_ignore_robots_txt,
        rss_feeds.unreliable_status_codes AS feed_unreliable_status_codes,
        url_hostnames.unreliable_status_codes AS hostname_unreliable_status_codes,
        COALESCE(t.crawl_score, 0) AS crawl_score
      FROM rss_feeds
      JOIN urls ON urls.id = rss_feeds.rss_feed_url_id
      JOIN url_hostnames ON url_hostnames.id = urls.hostname_id
      LEFT JOIN mv_rss_feed_crawl_tiers t ON t.rss_feed_id = rss_feeds.id
      WHERE rss_feeds.id = bw.raw_id
        AND (url_hostnames.network_backoff_ends_at IS NULL
          OR url_hostnames.network_backoff_ends_at <= CURRENT_TIMESTAMP)
        AND (url_hostnames.rate_limit_ends_at IS NULL
          OR url_hostnames.rate_limit_ends_at <= CURRENT_TIMESTAMP)
      LIMIT 1
    ) feed ON TRUE
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
    const { rows: skippedRows } = await read<{
      scanned: number
      raw_id: string
      raw_last_fetch_succeeded_at: string | null
    }>(
      `/* countSkippedHealthyRssFeeds */
      WITH skipped AS (
        SELECT
          ROW_NUMBER() OVER (ORDER BY COALESCE(s.last_fetch_succeeded_at, '-infinity'::timestamptz) ASC, s.rss_feed_id ASC)::int AS raw_pos,
          s.rss_feed_id AS raw_id,
          to_char(s.last_fetch_succeeded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS raw_last_fetch_succeeded_at
        FROM rss_feed_fetch_states s
        WHERE s.crawl_tier = $1::smallint
          AND (s.last_fetch_failed_at IS NULL OR s.last_fetch_failed_at < s.last_fetch_succeeded_at)
          AND COALESCE(s.last_fetch_succeeded_at, '-infinity'::timestamptz) <= $2::timestamptz
          AND (COALESCE(s.last_fetch_succeeded_at, '-infinity'::timestamptz), s.rss_feed_id) > ($3::timestamptz, $4::uuid)
          AND s.rss_feed_id <= $5::uuid
        ORDER BY COALESCE(s.last_fetch_succeeded_at, '-infinity'::timestamptz) ASC, s.rss_feed_id ASC
        LIMIT $6::int
      )
      SELECT raw_pos AS scanned, raw_id, raw_last_fetch_succeeded_at
      FROM skipped ORDER BY raw_pos DESC LIMIT 1`,
      [tier, upperLastSucceededAt, lowerLastSucceededAt, lowerId, throughId, rawBudget],
    )
    const lastSkipped = skippedRows[0]
    const scanned = lastSkipped?.scanned ?? 0
    return {
      feeds: [],
      rawRowsRead: scanned,
      ...(scanned < rawBudget
        ? nextLaneCursor
        : lastSkipped
          ? { nextCursor: buildHealthyCursor(lane, lastSkipped, throughId) }
          : {}),
    }
  }
  const consumed = rows.slice(0, limit)
  const hasMoreInLane = rows.length > limit || (rawBudget <= limit && rows.length === limit)
  const lastConsumed = consumed.at(-1)
  return {
    feeds: consumed.map(
      ({ raw_pos: _p, raw_id: _i, raw_last_fetch_succeeded_at: _s, ...feed }) => feed,
    ),
    rawRowsRead: rows.at(-1)?.raw_pos ?? rows.length,
    ...(hasMoreInLane && lastConsumed
      ? { nextCursor: buildHealthyCursor(lane, lastConsumed, throughId) }
      : nextLaneCursor),
  }
}

function buildHealthyCursor(
  lane: number,
  row: { raw_id: string; raw_last_fetch_succeeded_at: string | null },
  throughId: string,
): RssFeedDispatchCursor {
  return {
    lane,
    afterId: row.raw_id,
    afterLastSucceededAt: row.raw_last_fetch_succeeded_at,
    throughId,
  }
}
