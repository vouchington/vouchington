import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { captureModerationSummarySourceUpper } from './moderation-summary-rank-upper.mts'
import {
  MODERATION_SUMMARY_ZERO_ID,
  type ModerationSummaryScan,
} from '@queues/background/enqueues/moderation-summary-state'
export async function collectRankReviewPage(
  scan: ModerationSummaryScan,
  size: number,
): Promise<void> {
  const metrics = scan.metrics
  const upperId = await captureModerationSummarySourceUpper(scan, 'reviews')

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
  for (const row of rows) {
    scan.afterId = row.post_id
    if (row.is_live) {
      metrics.pending_post_reviews = Math.min(100, metrics.pending_post_reviews + 1)
      if (row.escalated_at) metrics.escalated_items = Math.min(100, metrics.escalated_items + 1)
    }
  }
  if (
    rows.length < size ||
    (metrics.pending_post_reviews === 100 && metrics.escalated_items === 100)
  )
    advance(scan, 'applications')
}
export async function collectRankApplicationPage(
  scan: ModerationSummaryScan,
  size: number,
): Promise<void> {
  const metrics = scan.metrics
  const upperId = await captureModerationSummarySourceUpper(scan, 'applications')

  const { rows } = await read<{
    id: string
    approved_at: Date | null
    rejected_at: Date | null
  }>(sql`/* collectModerationSummaryApplicationPage */
      SELECT id,approved_at,rejected_at FROM community_applications
      WHERE community_id=${scan.communityId} AND id>${scan.afterId} AND id<=${upperId}
      ORDER BY id LIMIT ${size}`)
  for (const row of rows) {
    scan.afterId = row.id
    if (!row.approved_at && !row.rejected_at)
      metrics.pending_applications = Math.min(100, metrics.pending_applications + 1)
  }
  if (rows.length < size || metrics.pending_applications === 100) advance(scan, 'report-posts')
}
export async function collectRankEvaders(scan: ModerationSummaryScan): Promise<void> {
  const metrics = scan.metrics

  // Every predicate is supplied by the existing suspected-evasion partial index.
  const { rows } = await read<{ count: number }>(sql`/* countModerationSummaryEvaders */
      SELECT count(*)::int AS count FROM (SELECT 1 FROM community_members
        WHERE community_id=${scan.communityId} AND removed_at IS NULL AND suspected_ban_evader_at IS NOT NULL
          AND suspected_ban_evader_dismissed_at IS NULL
        ORDER BY suspected_ban_evader_at DESC LIMIT 100) counted`)
  metrics.suspected_ban_evaders = rows[0]?.count ?? 0
  scan.stage = 'complete'
}

function advance(scan: ModerationSummaryScan, stage: ModerationSummaryScan['stage']): void {
  scan.stage = stage
  scan.afterId = MODERATION_SUMMARY_ZERO_ID
  scan.sourceUpperId = null
}
