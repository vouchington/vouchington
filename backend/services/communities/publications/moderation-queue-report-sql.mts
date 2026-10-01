import sql from 'sql-template-strings'
import {
  appendReportTargetColumns,
  communityPostNotApprovedSql,
  moderationReportsWithEntitySql,
  reportTargetJoinsSql,
} from '@services/moderation-reports/target-metadata'
import type { ModerationReportStatus } from '@services/moderation-reports/config'
import { appendModerationReportStatusPredicate } from '@services/moderation-reports/sort-sql'

export function buildCommunityReportQueueQuery(
  communityId: string,
  status: ModerationReportStatus,
) {
  const reportQuery = sql`/* searchCommunityModerationQueue:reports */
    SELECT
      r.id,
      r.created_at,
      to_char(
        r.created_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ) AS cursor_created_at,
      r.reviewed_at,
      r.reporter_user_id,
      NULL::text AS reporter_username,
      r.entity_type,
      r.entity_id,
  `
  appendReportTargetColumns(reportQuery, { includeAvailable: true })
  reportQuery.append(sql`,
      r.reason,
      r.note,
      r.status,
      r.resolved_by_id,
      report_counts.report_count,
      report_counts.report_count AS cursor_report_count,
      CASE latest_judgement.recommended_action
        WHEN 'escalate' THEN 4
        WHEN 'remove' THEN 3
        WHEN 'warn' THEN 2
        WHEN 'no_action' THEN 1
        ELSE 0
      END AS cursor_severity_rank,
      CASE
        WHEN r.post_id IS NOT NULL AND target_post.post_type = 'comment' THEN
          (root_post.broadcast <> 'everyone' OR root_post.privacy <> 'public'
          OR `)
  reportQuery.append(communityPostNotApprovedSql('root_post'))
  reportQuery.append(sql`)
        ELSE
          (target_post.broadcast <> 'everyone' OR target_post.privacy <> 'public'
          OR `)
  reportQuery.append(communityPostNotApprovedSql('target_post'))
  reportQuery.append(sql`)
      END AS target_is_restricted,
      COALESCE(target_post.is_anonymous, false) AS target_is_anonymous,
      'report'::text AS queue_source
    FROM `)
  reportQuery.append(moderationReportsWithEntitySql())
  reportQuery.append(sql` r
  `)
  reportQuery.append(reportTargetJoinsSql())
  reportQuery.append(sql`
    LEFT JOIN LATERAL (
      SELECT COUNT(DISTINCT rc.reporter_user_id)::integer AS report_count
      FROM moderation_reports rc
      WHERE COALESCE(rc.post_id, rc.reported_user_id, rc.hostname_id, rc.rss_feed_item_id)
              = COALESCE(r.post_id, r.reported_user_id, r.hostname_id, r.rss_feed_item_id)
        AND `)
  appendModerationReportStatusPredicate(reportQuery, 'rc', status)
  reportQuery.append(sql`
    ) report_counts ON true
    LEFT JOIN LATERAL (
      SELECT mj.recommended_action
      FROM moderation_report_judgements mj
      WHERE COALESCE(mj.post_id, mj.reported_user_id, mj.hostname_id, mj.rss_feed_item_id)
              = COALESCE(r.post_id, r.reported_user_id, r.hostname_id, r.rss_feed_item_id)
      ORDER BY mj.id DESC
      LIMIT 1
    ) latest_judgement ON true
  `)
  reportQuery.append(sql`
    WHERE `)
  appendModerationReportStatusPredicate(reportQuery, 'r', status)
  reportQuery.append(sql`
      AND r.post_id IS NOT NULL
      AND target_post.community_id = ${communityId}
  `)
  return reportQuery
}
