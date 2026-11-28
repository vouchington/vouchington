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
  raw_pos: number
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
        ROW_NUMBER() OVER (ORDER BY s.last_fetch_failed_at ASC, s.rss_feed_id ASC)::int AS raw_pos,
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
      bw.raw_pos, bw.raw_id, bw.raw_last_fetch_failed_at,
      feed.id, feed.url, feed.url_hostname_id, feed.crawlable,
      feed.title, feed.declared_language, feed.last_modified_at, feed.etag,
      bw.last_fetch_succeeded_at, bw.last_fetch_failed_at,
      feed.feed_type, feed.feed_ignore_robots_txt, feed.hostname_ignore_robots_txt,
      feed.feed_unreliable_status_codes, feed.hostname_unreliable_status_codes,
      feed.crawl_score, bw.crawl_tier,
      1 AS priority_group, $4::int AS dispatch_lane
    FROM bounded_walk bw
    JOIN LATERAL (
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
    const { rows: skippedRows } = await read<{
      scanned: number
      raw_id: string
      raw_last_fetch_failed_at: string
    }>(
      `/* countSkippedFailingRssFeeds */
      WITH skipped AS (
        SELECT
          ROW_NUMBER() OVER (ORDER BY s.last_fetch_failed_at ASC, s.rss_feed_id ASC)::int AS raw_pos,
          s.rss_feed_id AS raw_id,
          to_char(s.last_fetch_failed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS raw_last_fetch_failed_at
        FROM rss_feed_fetch_states s
        WHERE s.last_fetch_failed_at IS NOT NULL
          AND (s.last_fetch_succeeded_at IS NULL
            OR s.last_fetch_failed_at >= s.last_fetch_succeeded_at)
          AND s.last_fetch_failed_at <= $1::timestamptz
          ${skippedCursorPredicate}
          AND s.rss_feed_id <= $2::uuid
        ORDER BY s.last_fetch_failed_at ASC, s.rss_feed_id ASC
        LIMIT $3::int
      )
      SELECT raw_pos AS scanned, raw_id, raw_last_fetch_failed_at
      FROM skipped ORDER BY raw_pos DESC LIMIT 1`,
      [
        retryCutoff,
        throughId,
        rawBudget,
        ...(hasTimestampCursor ? [cursor.afterLastFailedAt, cursor.afterId ?? NIL_UUID] : []),
      ],
    )
    const lastSkipped = skippedRows[0]
    const scanned = lastSkipped?.scanned ?? 0
    return {
      feeds: [],
      rawRowsRead: scanned,
      ...(scanned < rawBudget
        ? nextLaneCursor
        : lastSkipped
          ? {
              nextCursor: {
                lane: FAILING_DISPATCH_LANE,
                afterId: lastSkipped.raw_id,
                afterLastFailedAt: lastSkipped.raw_last_fetch_failed_at,
                throughId,
              },
            }
          : {}),
    }
  }
  const consumed = rows.slice(0, limit)
  const hasMoreInLane = rows.length > limit || (rawBudget <= limit && rows.length === limit)
  const lastConsumed = consumed.at(-1)
  const rawRowsRead = rows.at(-1)?.raw_pos ?? rows.length
  return {
    feeds: consumed.map(row => {
      const {
        raw_pos: _rawPos,
        raw_id: _rawId,
        raw_last_fetch_failed_at: _rawFailedAt,
        ...feed
      } = row
      return feed
    }),
    rawRowsRead,
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
