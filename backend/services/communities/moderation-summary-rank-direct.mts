import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { readModerationSummarySourceUpper } from './moderation-summary-rank-upper.mts'
import {
  capModerationSummaryCount,
  startModerationSummarySource,
  type PageStep,
} from './moderation-summary-pages.mts'
import type { ModerationSummaryScan } from '@queues/background/enqueues/moderation-summary-state'

export async function collectRankReviewPage(
  scan: ModerationSummaryScan,
  size: number,
): Promise<PageStep<ModerationSummaryScan>> {
  const upperId = await readModerationSummarySourceUpper(scan, 'reviews')
  const { rows } = await read<{
    post_id: string
    is_live: boolean
    escalated_at: Date | null
  }>(sql`/* collectModerationSummaryReviewPage */
      SELECT review.post_id,review.escalated_at,
        (SELECT post.deleted_at IS NULL FROM posts post WHERE post.id=review.post_id) AS is_live
      FROM community_post_reviews review WHERE review.community_id=${scan.communityId}
        AND review.approved_at IS NULL AND review.rejected_at IS NULL AND review.unpublished_at IS NULL
        AND (review.community_id,review.post_id)>(${scan.communityId},${scan.afterId})
        AND (review.community_id,review.post_id)<=(${scan.communityId},${upperId})
      ORDER BY review.community_id,review.post_id LIMIT ${size}`)
  let { pending_post_reviews: pending, escalated_items: escalated } = scan.metrics
  let afterId = scan.afterId
  for (const row of rows) {
    afterId = row.post_id
    if (!row.is_live) continue
    pending = capModerationSummaryCount(pending)
    if (row.escalated_at) escalated = capModerationSummaryCount(escalated)
  }
  const state = {
    ...scan,
    afterId,
    sourceUpperId: upperId,
    metrics: { ...scan.metrics, pending_post_reviews: pending, escalated_items: escalated },
  }
  return rows.length < size || (pending === 100 && escalated === 100)
    ? { state: startModerationSummarySource(state), next: 'applications' }
    : { state, next: null }
}

export async function collectRankApplicationPage(
  scan: ModerationSummaryScan,
  size: number,
): Promise<PageStep<ModerationSummaryScan>> {
  const upperId = await readModerationSummarySourceUpper(scan, 'applications')
  const { rows } = await read<{
    id: string
    approved_at: Date | null
    rejected_at: Date | null
  }>(sql`/* collectModerationSummaryApplicationPage */
      SELECT id,approved_at,rejected_at FROM community_applications
      WHERE community_id=${scan.communityId} AND id>${scan.afterId} AND id<=${upperId}
      ORDER BY id LIMIT ${size}`)
  const pendingRows = rows.filter(row => !row.approved_at && !row.rejected_at).length
  const pending = Math.min(100, scan.metrics.pending_applications + pendingRows)
  const state = {
    ...scan,
    afterId: rows.at(-1)?.id ?? scan.afterId,
    sourceUpperId: upperId,
    metrics: { ...scan.metrics, pending_applications: pending },
  }
  return rows.length < size || pending === 100
    ? { state: startModerationSummarySource(state), next: 'reportPosts' }
    : { state, next: null }
}

export async function collectRankEvaders(
  scan: ModerationSummaryScan,
): Promise<ModerationSummaryScan> {
  // Every predicate is supplied by the existing suspected-evasion partial index.
  const { rows } = await read<{ count: number }>(sql`/* countModerationSummaryEvaders */
      SELECT count(*)::int AS count FROM (SELECT 1 FROM community_members
        WHERE community_id=${scan.communityId} AND removed_at IS NULL AND suspected_ban_evader_at IS NOT NULL
          AND suspected_ban_evader_dismissed_at IS NULL
        ORDER BY suspected_ban_evader_at DESC LIMIT 100) counted`)
  return { ...scan, metrics: { ...scan.metrics, suspected_ban_evaders: rows[0]?.count ?? 0 } }
}
