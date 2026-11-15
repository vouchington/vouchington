import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  captureModerationSummarySourceUpper,
  captureModerationSummaryChildUpper,
} from './moderation-summary-rank-upper.mts'
import {
  MODERATION_SUMMARY_ZERO_ID,
  type ModerationSummaryScan,
} from '@queues/background/enqueues/moderation-summary-state'
export async function collectRankReportPostPage(
  scan: ModerationSummaryScan,
  size: number,
): Promise<void> {
  const metrics = scan.metrics

  if (metrics.pending_reports === 100 && metrics.escalated_items === 100) {
    advance(scan, 'evaders')
    return
  }
  const upperId = await captureModerationSummarySourceUpper(scan, 'report-posts')
  const { rows } = await read<{
    id: string
    has_pending: boolean
  }>(sql`/* collectModerationSummaryReportPostPage */
      SELECT post.id,COALESCE((SELECT TRUE FROM moderation_reports report WHERE report.post_id=post.id
        AND report.reviewed_at IS NULL AND report.resolution_action IS NULL ORDER BY report.id LIMIT 1),FALSE) AS has_pending
      FROM posts post WHERE post.community_id=${scan.communityId} AND post.id>${scan.afterId} AND post.id<=${upperId}
      ORDER BY post.id LIMIT ${size}`)
  for (const row of rows) {
    scan.afterId = row.id
    if (row.has_pending) {
      scan.parentId = row.id
      scan.afterChildId = MODERATION_SUMMARY_ZERO_ID
      scan.childUpperId = null
      scan.stage = 'reports'
      return
    }
  }
  if (rows.length < size) advance(scan, 'evaders')
}
export async function collectRankReportPage(
  scan: ModerationSummaryScan,
  size: number,
): Promise<void> {
  const metrics = scan.metrics
  const upperId = await captureModerationSummaryChildUpper(scan)

  const { rows } = await read<{
    id: string
    escalated_at: Date | null
    latest_escalates: boolean
    current_community_id: string | null
  }>(sql`/* collectModerationSummaryReportPage */
      SELECT report.id,report.escalated_at,(SELECT post.community_id FROM posts post WHERE post.id=${scan.parentId}) AS current_community_id,COALESCE((SELECT judgement.recommended_action='escalate'
        FROM moderation_report_judgements judgement WHERE judgement.post_id=${scan.parentId}
        ORDER BY judgement.id DESC LIMIT 1),FALSE) AS latest_escalates
      FROM moderation_reports report WHERE report.post_id=${scan.parentId}
        AND report.reviewed_at IS NULL AND report.resolution_action IS NULL
        AND report.id>${scan.afterChildId} AND report.id<=${upperId}
      ORDER BY report.id LIMIT ${size}`)
  for (const row of rows) {
    scan.afterChildId = row.id
    if (row.current_community_id !== scan.communityId) continue
    metrics.pending_reports = Math.min(100, metrics.pending_reports + 1)
    if (row.escalated_at || row.latest_escalates)
      metrics.escalated_items = Math.min(100, metrics.escalated_items + 1)
  }
  if (
    rows.length < size ||
    rows[0]?.current_community_id !== scan.communityId ||
    (metrics.pending_reports === 100 && metrics.escalated_items === 100)
  ) {
    scan.parentId = null
    scan.childUpperId = null
    scan.stage = 'report-posts'
  }
}

function advance(scan: ModerationSummaryScan, stage: ModerationSummaryScan['stage']): void {
  scan.stage = stage
  scan.afterId = MODERATION_SUMMARY_ZERO_ID
  scan.sourceUpperId = null
}
