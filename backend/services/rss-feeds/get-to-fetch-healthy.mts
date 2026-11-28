import * as crawlConfig from './crawl-config.mts'
import type { RssFeedCrawlTier } from './crawl-config.mts'
import { readRssFeedDispatchLane } from './get-to-fetch-lane.mts'
import type { RssFeedDispatchCursor, RssFeedDispatchPage } from './get-to-fetch-types.mts'

const NIL_UUID = '00000000-0000-0000-0000-000000000000'
const MAX_UUID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
const HEALTHY_SORT_EXPR = `COALESCE(s.last_fetch_succeeded_at, '-infinity'::timestamptz)`
const HEALTHY_WALK_ORDER = `${HEALTHY_SORT_EXPR} ASC, s.rss_feed_id ASC`
const HEALTHY_CURSOR_EXPR = `to_char(s.last_fetch_succeeded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
const HEALTHY_WALK_WHERE = `s.crawl_tier = $1::smallint
  AND (s.last_fetch_failed_at IS NULL OR s.last_fetch_failed_at < s.last_fetch_succeeded_at)
  AND ${HEALTHY_SORT_EXPR} <= $2::timestamptz
  AND (${HEALTHY_SORT_EXPR}, s.rss_feed_id) > ($3::timestamptz, $4::uuid)
  AND s.rss_feed_id <= $5::uuid`

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
  const subMs = typeof afterTs === 'string' ? /\.(\d{4,6})/.exec(afterTs)?.[1] : undefined
  const useCursor =
    typeof afterTs === 'string' &&
    (afterMs > dueCutoff.getTime() ||
      (afterMs === dueCutoff.getTime() && Number(subMs?.slice(3).padEnd(3, '0') ?? 0) > 0))
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

  return readRssFeedDispatchLane<string | null>({
    queryName: 'getRssFeedsHealthy',
    countQueryName: 'countSkippedHealthyRssFeeds',
    lane,
    priorityGroup: lane <= 5 ? 1 : 2,
    limit,
    rawBudget,
    walkOrder: HEALTHY_WALK_ORDER,
    walkSortExpr: HEALTHY_SORT_EXPR,
    walkCursorExpr: HEALTHY_CURSOR_EXPR,
    walkWhere: HEALTHY_WALK_WHERE,
    walkParams: [tier, upperLastSucceededAt, lowerLastSucceededAt, lowerId, throughId],
    nextLaneCursor,
    buildResumeWalk: lastRow => ({
      where: HEALTHY_WALK_WHERE,
      params: [
        tier,
        upperLastSucceededAt,
        lastRow ? (lastRow.raw_cursor_ts ?? '-infinity') : lowerLastSucceededAt,
        lastRow ? lastRow.raw_id : lowerId,
        throughId,
      ],
    }),
    buildCursor: row => ({
      lane,
      afterId: row.raw_id,
      afterLastSucceededAt: row.raw_cursor_ts,
      throughId,
    }),
  })
}
