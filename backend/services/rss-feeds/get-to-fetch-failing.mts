import * as crawlConfig from './crawl-config.mts'
import { readRssFeedDispatchLane } from './get-to-fetch-lane.mts'
import type { RssFeedDispatchCursor, RssFeedDispatchPage } from './get-to-fetch-types.mts'

const NIL_UUID = '00000000-0000-0000-0000-000000000000'
export const FAILING_DISPATCH_LANE = 6

const FAILING_SORT_EXPR = `s.last_fetch_failed_at`
const FAILING_WALK_ORDER = `s.last_fetch_failed_at ASC, s.rss_feed_id ASC`
const FAILING_CURSOR_EXPR = `to_char(s.last_fetch_failed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
const FAILING_BASE_WHERE = `s.last_fetch_failed_at IS NOT NULL
  AND (s.last_fetch_succeeded_at IS NULL OR s.last_fetch_failed_at >= s.last_fetch_succeeded_at)
  AND s.last_fetch_failed_at <= $1::timestamptz
  AND s.rss_feed_id <= $2::uuid`
const FAILING_CURSOR_WHERE = `${FAILING_BASE_WHERE}
  AND (s.last_fetch_failed_at, s.rss_feed_id) > ($3::timestamptz, $4::uuid)`

function buildFailingWalk(
  retryCutoff: Date,
  throughId: string,
  after?: { afterLastFailedAt: string; afterId: string },
) {
  return after
    ? {
        where: FAILING_CURSOR_WHERE,
        params: [retryCutoff, throughId, after.afterLastFailedAt, after.afterId],
      }
    : { where: FAILING_BASE_WHERE, params: [retryCutoff, throughId] }
}

export async function getRssFeedsFailing(
  limit: number,
  rawBudget: number,
  asOf: Date,
  throughId: string,
  cursor?: RssFeedDispatchCursor,
): Promise<RssFeedDispatchPage> {
  const retryCutoff = new Date(asOf.getTime() - crawlConfig.getFetchRetryIntervalMs())
  const initialAfter =
    typeof cursor?.afterLastFailedAt === 'string'
      ? { afterLastFailedAt: cursor.afterLastFailedAt, afterId: cursor.afterId ?? NIL_UUID }
      : undefined
  const initialWalk = buildFailingWalk(retryCutoff, throughId, initialAfter)

  return readRssFeedDispatchLane<string>({
    queryName: 'getRssFeedsFailing',
    countQueryName: 'countSkippedFailingRssFeeds',
    lane: FAILING_DISPATCH_LANE,
    priorityGroup: 1,
    limit,
    rawBudget,
    walkOrder: FAILING_WALK_ORDER,
    walkSortExpr: FAILING_SORT_EXPR,
    walkCursorExpr: FAILING_CURSOR_EXPR,
    walkWhere: initialWalk.where,
    walkParams: initialWalk.params,
    nextLaneCursor: {
      nextCursor: { lane: FAILING_DISPATCH_LANE + 1, afterId: NIL_UUID, throughId },
    },
    buildResumeWalk: lastRow =>
      buildFailingWalk(
        retryCutoff,
        throughId,
        lastRow
          ? { afterLastFailedAt: lastRow.raw_cursor_ts, afterId: lastRow.raw_id }
          : initialAfter,
      ),
    buildCursor: row => ({
      lane: FAILING_DISPATCH_LANE,
      afterId: row.raw_id,
      afterLastFailedAt: row.raw_cursor_ts,
      throughId,
    }),
  })
}
