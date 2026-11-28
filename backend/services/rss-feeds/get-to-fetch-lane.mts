import { read } from '@data-stores/psql'
import { RSS_FEED_CRAWL_MAX_VALUES } from './crawl-config.mts'
import type {
  RssFeedDispatchCursor,
  RssFeedDispatchPage,
  RssFeedToFetch,
} from './get-to-fetch-types.mts'

type LaneRawRow<CursorTs extends string | null> = RssFeedToFetch & {
  dispatch_lane: number
  raw_pos: number
  raw_id: string
  raw_cursor_ts: CursorTs
}

type SkippedLaneRow<CursorTs extends string | null> = {
  scanned: number
  raw_id: string
  raw_cursor_ts: CursorTs
}

export type RssFeedDispatchLaneSpec<CursorTs extends string | null> = {
  queryName: 'getRssFeedsHealthy' | 'getRssFeedsFailing'
  countQueryName: 'countSkippedHealthyRssFeeds' | 'countSkippedFailingRssFeeds'
  lane: number
  priorityGroup: number
  limit: number
  rawBudget: number
  walkOrder: string
  walkSortExpr: string
  walkCursorExpr: string
  walkWhere: string
  walkParams: unknown[]
  nextLaneCursor: { nextCursor?: RssFeedDispatchCursor }
  buildResumeWalk: (lastRow: { raw_id: string; raw_cursor_ts: CursorTs } | undefined) => {
    where: string
    params: unknown[]
  }
  buildCursor: (row: { raw_id: string; raw_cursor_ts: CursorTs }) => RssFeedDispatchCursor
}

const FEED_HYDRATION_LATERAL = `JOIN LATERAL (
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
        AND (url_hostnames.network_backoff_ends_at IS NULL OR url_hostnames.network_backoff_ends_at <= CURRENT_TIMESTAMP)
        AND (url_hostnames.rate_limit_ends_at IS NULL OR url_hostnames.rate_limit_ends_at <= CURRENT_TIMESTAMP)
      LIMIT 1
    ) feed ON TRUE`

export async function readRssFeedDispatchLane<CursorTs extends string | null>(
  spec: RssFeedDispatchLaneSpec<CursorTs>,
): Promise<RssFeedDispatchPage> {
  const rawHardMax = RSS_FEED_CRAWL_MAX_VALUES.raw_read_budget
  const eligibleHardMax = RSS_FEED_CRAWL_MAX_VALUES.capacity_budget + 1
  const eligibleLimit = Math.min(spec.limit + 1, spec.rawBudget)
  const baseParam = spec.walkParams.length
  const rawBudgetParam = baseParam + 1
  const rawHardMaxParam = baseParam + 2
  const priorityGroupParam = baseParam + 3
  const laneParam = baseParam + 4
  const eligibleLimitParam = baseParam + 5
  const eligibleHardMaxParam = baseParam + 6

  const query = `/* ${spec.queryName} */
    WITH bounded_walk AS NOT MATERIALIZED (
      SELECT
        ROW_NUMBER() OVER (ORDER BY ${spec.walkOrder})::int AS raw_pos,
        s.rss_feed_id AS raw_id,
        ${spec.walkSortExpr} AS sort_key,
        ${spec.walkCursorExpr} AS raw_cursor_ts,
        s.last_fetch_succeeded_at, s.last_fetch_failed_at, s.crawl_tier
      FROM rss_feed_fetch_states s
      WHERE ${spec.walkWhere}
      ORDER BY ${spec.walkOrder}
      LIMIT LEAST($${rawBudgetParam}::int, $${rawHardMaxParam}::int)
    )
    SELECT
      bw.raw_pos, bw.raw_id, bw.raw_cursor_ts,
      feed.id, feed.url, feed.url_hostname_id, feed.crawlable,
      feed.title, feed.declared_language, feed.last_modified_at, feed.etag,
      bw.last_fetch_succeeded_at, bw.last_fetch_failed_at,
      feed.feed_type, feed.feed_ignore_robots_txt, feed.hostname_ignore_robots_txt,
      feed.feed_unreliable_status_codes, feed.hostname_unreliable_status_codes,
      feed.crawl_score, bw.crawl_tier,
      $${priorityGroupParam}::int AS priority_group, $${laneParam}::int AS dispatch_lane
    FROM bounded_walk bw
    ${FEED_HYDRATION_LATERAL}
    ORDER BY bw.sort_key ASC, bw.raw_id ASC
    LIMIT LEAST($${eligibleLimitParam}::int, $${eligibleHardMaxParam}::int)`

  const { rows } = await read<LaneRawRow<CursorTs>>(query, [
    ...spec.walkParams,
    spec.rawBudget,
    rawHardMax,
    spec.priorityGroup,
    spec.lane,
    eligibleLimit,
    eligibleHardMax,
  ])

  if (rows.length < eligibleLimit) {
    const lastRow = rows.at(-1)
    const remainingRaw = spec.rawBudget - (lastRow?.raw_pos ?? 0)
    const lastSkipped =
      remainingRaw > 0
        ? await countSkippedLaneRows(spec, lastRow, remainingRaw, rawHardMax)
        : undefined
    const rawRowsRead = (lastRow?.raw_pos ?? 0) + (lastSkipped?.scanned ?? 0)
    const resumeRow = lastSkipped ?? lastRow
    return {
      feeds: rows.map(stripLaneMeta),
      rawRowsRead,
      ...(rawRowsRead < spec.rawBudget
        ? spec.nextLaneCursor
        : resumeRow
          ? { nextCursor: spec.buildCursor(resumeRow) }
          : {}),
    }
  }

  const consumed = rows.slice(0, spec.limit)
  return {
    feeds: consumed.map(stripLaneMeta),
    rawRowsRead: rows.at(-1)?.raw_pos ?? rows.length,
    nextCursor: spec.buildCursor(consumed.at(-1)!),
  }
}

async function countSkippedLaneRows<CursorTs extends string | null>(
  spec: RssFeedDispatchLaneSpec<CursorTs>,
  lastRow: { raw_id: string; raw_cursor_ts: CursorTs } | undefined,
  rawLimit: number,
  rawHardMax: number,
): Promise<SkippedLaneRow<CursorTs> | undefined> {
  const resume = spec.buildResumeWalk(lastRow)
  const limitParam = resume.params.length + 1
  const hardMaxParam = resume.params.length + 2
  const { rows } = await read<SkippedLaneRow<CursorTs>>(
    `/* ${spec.countQueryName} */
    WITH skipped AS (
      SELECT
        ROW_NUMBER() OVER (ORDER BY ${spec.walkOrder})::int AS raw_pos,
        s.rss_feed_id AS raw_id,
        ${spec.walkCursorExpr} AS raw_cursor_ts
      FROM rss_feed_fetch_states s
      WHERE ${resume.where}
      ORDER BY ${spec.walkOrder}
      LIMIT LEAST($${limitParam}::int, $${hardMaxParam}::int)
    )
    SELECT raw_pos AS scanned, raw_id, raw_cursor_ts
    FROM skipped ORDER BY raw_pos DESC LIMIT 1`,
    [...resume.params, rawLimit, rawHardMax],
  )
  return rows[0]
}

function stripLaneMeta<CursorTs extends string | null>(row: LaneRawRow<CursorTs>) {
  const { raw_pos: _p, raw_id: _i, raw_cursor_ts: _c, ...feed } = row
  return feed
}
