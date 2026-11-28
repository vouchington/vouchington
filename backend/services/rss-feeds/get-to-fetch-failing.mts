import { read } from '@data-stores/psql'
import type {
  RssFeedDispatchCursor,
  RssFeedDispatchPage,
  RssFeedToFetch,
} from './get-to-fetch-types.mts'
import * as crawlConfig from './crawl-config.mts'

const NIL_UUID = '00000000-0000-0000-0000-000000000000'
export const FAILING_DISPATCH_LANE = 6

type FailingRawRow = RssFeedToFetch & {
  dispatch_lane: number
  raw_id: string
  raw_last_fetch_failed_at: string
}

export async function getRssFeedsFailing(
  limit: number,
  rawBudget: number,
  asOf: Date,
  throughId: string,
  cursor?: RssFeedDispatchCursor,
): Promise<RssFeedDispatchPage> {
  const retryCutoff = new Date(asOf.getTime() - crawlConfig.getFetchRetryIntervalMs())
  const hasTimestampCursor = typeof cursor?.afterLastFailedAt === 'string'
  const cursorPredicate = hasTimestampCursor
    ? `AND (s.last_fetch_failed_at, s.rss_feed_id) > ($6::timestamptz, $7::uuid)`
    : ''
  const eligibleLimit = Math.min(limit + 1, rawBudget)
  const query = `/* getRssFeedsFailing */
    WITH bounded_walk AS NOT MATERIALIZED (
      SELECT
        s.rss_feed_id AS raw_id,
        s.last_fetch_failed_at AS sort_last_fetch_failed_at,
        to_char(s.last_fetch_failed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS raw_last_fetch_failed_at,
        s.last_fetch_succeeded_at,
        s.last_fetch_failed_at,
        s.crawl_tier
      FROM rss_feed_fetch_states s
      WHERE s.last_fetch_failed_at IS NOT NULL
        AND (s.last_fetch_succeeded_at IS NULL
          OR s.last_fetch_failed_at >= s.last_fetch_succeeded_at)
        AND s.last_fetch_failed_at <= $1::timestamptz
        ${cursorPredicate}
        AND s.rss_feed_id <= $2::uuid
      ORDER BY s.last_fetch_failed_at ASC, s.rss_feed_id ASC
      LIMIT $3::int
    )
    SELECT
      bw.raw_id,
      bw.raw_last_fetch_failed_at,
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
      1 AS priority_group,
      $4::int AS dispatch_lane
    FROM bounded_walk bw
    JOIN rss_feeds ON rss_feeds.id = bw.raw_id
    JOIN urls ON urls.id = rss_feeds.rss_feed_url_id
    JOIN url_hostnames ON url_hostnames.id = urls.hostname_id
    LEFT JOIN mv_rss_feed_crawl_tiers t ON t.rss_feed_id = bw.raw_id
    WHERE (url_hostnames.network_backoff_ends_at IS NULL
        OR url_hostnames.network_backoff_ends_at <= CURRENT_TIMESTAMP)
      AND (url_hostnames.rate_limit_ends_at IS NULL
        OR url_hostnames.rate_limit_ends_at <= CURRENT_TIMESTAMP)
    ORDER BY bw.sort_last_fetch_failed_at ASC, bw.raw_id ASC
    LIMIT $5::int`

  const params: unknown[] = [
    retryCutoff,
    throughId,
    rawBudget,
    FAILING_DISPATCH_LANE,
    eligibleLimit,
    ...(hasTimestampCursor ? [cursor.afterLastFailedAt, cursor.afterId ?? NIL_UUID] : []),
  ]
  const { rows } = await read<FailingRawRow>(query, params)
  const nextLaneCursor = {
    nextCursor: { lane: FAILING_DISPATCH_LANE + 1, afterId: NIL_UUID, throughId },
  }
  if (rows.length === 0) {
    const skippedCursorPredicate = hasTimestampCursor
      ? `AND (s.last_fetch_failed_at, s.rss_feed_id) > ($4::timestamptz, $5::uuid)`
      : ''
    const { rows: skippedRows } = await read<{ scanned: number }>(
      `/* countSkippedFailingRssFeeds */
      SELECT COUNT(*)::int AS scanned
      FROM (
        SELECT 1
        FROM rss_feed_fetch_states s
        WHERE s.last_fetch_failed_at IS NOT NULL
          AND (s.last_fetch_succeeded_at IS NULL
            OR s.last_fetch_failed_at >= s.last_fetch_succeeded_at)
          AND s.last_fetch_failed_at <= $1::timestamptz
          ${skippedCursorPredicate}
          AND s.rss_feed_id <= $2::uuid
        ORDER BY s.last_fetch_failed_at ASC, s.rss_feed_id ASC
        LIMIT $3::int
      ) skipped`,
      [
        retryCutoff,
        throughId,
        rawBudget,
        ...(hasTimestampCursor ? [cursor.afterLastFailedAt, cursor.afterId ?? NIL_UUID] : []),
      ],
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
      const { raw_id: _rawId, raw_last_fetch_failed_at: _rawFailedAt, ...feed } = row
      return feed
    }),
    rawRowsRead: rows.length,
    ...(hasMoreInLane && lastConsumed
      ? {
          nextCursor: {
            lane: FAILING_DISPATCH_LANE,
            afterId: lastConsumed.raw_id,
            afterLastFailedAt: lastConsumed.raw_last_fetch_failed_at,
            throughId,
          },
        }
      : nextLaneCursor),
  }
}
