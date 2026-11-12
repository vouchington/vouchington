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

/**
 * Callers enforce staff access; missing or deleted targets expose neither report nor judgement.
 * Each target is a LIMIT 1 lateral probe so the planner cannot merge-join, and Sort, the one report
 * row against a whole target index when the costs nearly tie.
 */
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
      LEFT JOIN LATERAL (
        SELECT p.id, p.post_type, p.deleted_at FROM posts p WHERE p.id = r.post_id LIMIT 1
      ) target_post ON true
      LEFT JOIN LATERAL (
        SELECT u.id, u.deleted_at FROM users u WHERE u.id = r.reported_user_id LIMIT 1
      ) target_user ON true
      LEFT JOIN LATERAL (
        SELECT h.id FROM url_hostnames h WHERE h.id = r.hostname_id LIMIT 1
      ) target_hostname ON true
      LEFT JOIN LATERAL (
        SELECT i.id, i.deleted_at FROM rss_feed_items i WHERE i.id = r.rss_feed_item_id LIMIT 1
      ) target_rss_item ON true
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
