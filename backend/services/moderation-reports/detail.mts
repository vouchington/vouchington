import { read, withPrimaryReads } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { reportEntityFkColumn, type ModerationReport } from './config.mts'
import type { ModerationReportJudgement } from './judgements.mts'

export type ModerationReportDetailJudgement = Pick<
  ModerationReportJudgement,
  'id' | 'recommended_action' | 'public_response' | 'internal_response'
>

export type ModerationReportDetailReport = Pick<
  ModerationReport,
  | 'id'
  | 'case_id'
  | 'created_at'
  | 'reviewed_at'
  | 'reporter_user_id'
  | 'reason'
  | 'note'
  | 'status'
  | 'resolved_by_id'
  | 'entity_type'
  | 'entity_id'
>

export interface ModerationReportDetail {
  report: ModerationReportDetailReport
  judgement: ModerationReportDetailJudgement | null
}

/** Callers enforce staff access; missing or deleted targets expose neither report nor judgement. */
export function getModerationReportDetail(
  reportId: string,
): Promise<ModerationReportDetail | null> {
  return withPrimaryReads(async () => {
    const { rows } =
      await read<ModerationReportDetailReport>(sql`/* getModerationReportDetail:report */
      SELECT
        r.id, r.case_id, r.created_at, r.reviewed_at, r.reporter_user_id,
        r.reason, r.note, r.resolved_by_id,
        CASE WHEN r.reviewed_at IS NULL THEN 'pending' ELSE r.resolution_action::text END AS status,
        CASE
          WHEN r.post_id IS NOT NULL AND target_post.post_type = 'comment' THEN 'comment'
          WHEN r.post_id IS NOT NULL THEN 'post'
          WHEN r.reported_user_id IS NOT NULL THEN 'user'
          WHEN r.hostname_id IS NOT NULL THEN 'url_hostname'
          WHEN r.rss_feed_item_id IS NOT NULL THEN 'rss_feed_item'
        END::moderation_report_entity_types AS entity_type,
        COALESCE(r.post_id, r.reported_user_id, r.hostname_id, r.rss_feed_item_id) AS entity_id
      FROM moderation_reports r
      LEFT JOIN posts target_post ON r.post_id IS NOT NULL AND target_post.id = r.post_id
      LEFT JOIN users target_user ON r.reported_user_id IS NOT NULL AND target_user.id = r.reported_user_id
      LEFT JOIN url_hostnames target_hostname ON r.hostname_id IS NOT NULL AND target_hostname.id = r.hostname_id
      LEFT JOIN rss_feed_items target_rss_item ON r.rss_feed_item_id IS NOT NULL AND target_rss_item.id = r.rss_feed_item_id
      WHERE r.id = ${reportId}::uuid
        AND (
          (r.post_id IS NOT NULL AND target_post.id IS NOT NULL AND target_post.deleted_at IS NULL)
          OR (r.reported_user_id IS NOT NULL AND target_user.id IS NOT NULL AND target_user.deleted_at IS NULL)
          OR (r.hostname_id IS NOT NULL AND target_hostname.id IS NOT NULL)
          OR (r.rss_feed_item_id IS NOT NULL AND target_rss_item.id IS NOT NULL AND target_rss_item.deleted_at IS NULL)
        )
      LIMIT 1
    `)
    const report = rows[0]
    if (!report) return null

    const fkColumn = reportEntityFkColumn(report.entity_type)
    const judgementQuery = sql`/* getModerationReportDetail:judgement */
      SELECT id, recommended_action, public_response, internal_response
      FROM moderation_report_judgements
      WHERE `
    judgementQuery.append(fkColumn)
    judgementQuery.append(sql` = ${report.entity_id}::uuid ORDER BY id DESC LIMIT 1`)
    const { rows: judgements } = await read<ModerationReportDetailJudgement>(judgementQuery)
    return { report, judgement: judgements[0] ?? null }
  })
}
