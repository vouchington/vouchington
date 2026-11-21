import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  readModerationSummaryChildUpper,
  readModerationSummarySourceUpper,
} from './moderation-summary-rank-upper.mts'
import {
  capModerationSummaryCount,
  startModerationSummarySource,
  type PageStep,
} from './moderation-summary-pages.mts'
import {
  MODERATION_SUMMARY_ZERO_ID,
  type ModerationSummaryScan,
} from '@queues/background/enqueues/moderation-summary-state'

export async function collectRankReportPostPage(
  scan: ModerationSummaryScan,
  size: number,
): Promise<PageStep<ModerationSummaryScan>> {
  const { pending_reports: pending, escalated_items: escalated } = scan.metrics
  if (pending === 100 && escalated === 100)
    return { state: startModerationSummarySource(scan), next: 'evaders' }
  const upperId = await readModerationSummarySourceUpper(scan, 'report-posts')
  const { rows } = await read<{
    id: string
    has_pending: boolean
  }>(sql`/* collectModerationSummaryReportPostPage */
      SELECT post.id,COALESCE((SELECT TRUE FROM moderation_reports report WHERE report.post_id=post.id
        AND report.reviewed_at IS NULL AND report.resolution_action IS NULL ORDER BY report.id LIMIT 1),FALSE) AS has_pending
      FROM posts post WHERE post.community_id=${scan.communityId} AND post.id>${scan.afterId} AND post.id<=${upperId}
      ORDER BY post.id LIMIT ${size}`)
  const pendingIndex = rows.findIndex(row => row.has_pending)
  if (pendingIndex >= 0) {
    const parentId = rows[pendingIndex]!.id
    return {
      state: {
        ...scan,
        afterId: parentId,
        sourceUpperId: upperId,
        parentId,
        afterChildId: MODERATION_SUMMARY_ZERO_ID,
        childUpperId: null,
      },
      next: 'reports',
    }
  }
  const state = { ...scan, afterId: rows.at(-1)?.id ?? scan.afterId, sourceUpperId: upperId }
  return rows.length < size
    ? { state: startModerationSummarySource(state), next: 'evaders' }
    : { state, next: null }
}

export async function collectRankReportPage(
  scan: ModerationSummaryScan,
  size: number,
): Promise<PageStep<ModerationSummaryScan>> {
  const upperId = await readModerationSummaryChildUpper(scan)
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
  let { pending_reports: pending, escalated_items: escalated } = scan.metrics
  for (const row of rows) {
    if (row.current_community_id !== scan.communityId) continue
    pending = capModerationSummaryCount(pending)
    if (row.escalated_at || row.latest_escalates) escalated = capModerationSummaryCount(escalated)
  }
  const metrics = { ...scan.metrics, pending_reports: pending, escalated_items: escalated }
  if (
    rows.length < size ||
    rows[0]?.current_community_id !== scan.communityId ||
    (pending === 100 && escalated === 100)
  )
    return {
      state: { ...scan, parentId: null, childUpperId: null, metrics },
      next: 'reportPosts',
    }
  return {
    state: {
      ...scan,
      afterChildId: rows.at(-1)?.id ?? scan.afterChildId,
      childUpperId: upperId,
      metrics,
    },
    next: null,
  }
}
