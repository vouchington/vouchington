import sql from 'sql-template-strings'
import {
  appendReportTargetColumns,
  communityPostApprovalPredicateSql,
  moderationReportStatusSql,
  reportTargetJoinsSql,
} from '@services/moderation-reports/target-metadata'
import type { ModerationReportStatus } from '@services/moderation-reports/config'
import { appendModerationReportStatusPredicate } from '@services/moderation-reports/sort-sql'
import { reportAutomaticJudgementEnabledSql } from '@services/moderation-reports/automatic-judgement-eligibility'
import type { decodeCommunityModerationQueueCursor } from './moderation-queue-cursor.mts'

type ReportQueuePage = {
  limit: number
  after: ReturnType<typeof decodeCommunityModerationQueueCursor>
}

export function buildCommunityReportQueueQuery(
  communityId: string,
  status: ModerationReportStatus,
  page: ReportQueuePage,
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
      reporter_profile.username AS reporter_username,
      reporter_profile.verified_display_name AS reporter_display_name,
      r.entity_type,
      r.entity_id,
  `
  appendReportTargetColumns(reportQuery, { includeAvailable: true })
  reportQuery.append(sql`,
      r.reason,
      r.note,
      r.status,
      r.resolved_by_id,
      resolver_profile.username AS resolver_username,
      resolver_profile.verified_display_name AS resolver_display_name,
      report_counts.report_count,
      report_counts.report_count AS cursor_report_count,
      CASE latest_judgement.recommended_action
        WHEN 'escalate' THEN 4
        WHEN 'remove' THEN 3
        WHEN 'warn' THEN 2
        WHEN 'no_action' THEN 1
        ELSE 0
      END AS cursor_severity_rank,
      `)
  reportQuery.append(reportAutomaticJudgementEnabledSql())
  reportQuery.append(sql` AS automatic_judgement_enabled,
      CASE
        WHEN r.post_id IS NOT NULL AND target_post.post_type = 'comment' THEN
          (root_post.broadcast <> 'everyone' OR root_post.privacy <> 'public'
          OR `)
  reportQuery.append(communityQueuePostNotApprovedSql('root_post'))
  reportQuery.append(sql`)
        ELSE
          (target_post.broadcast <> 'everyone' OR target_post.privacy <> 'public'
          OR `)
  reportQuery.append(communityQueuePostNotApprovedSql('target_post'))
  reportQuery.append(sql`)
      END AS target_is_restricted,
      COALESCE(target_post.is_anonymous, false) AS target_is_anonymous,
      'report'::text AS queue_source
    FROM `)
  reportQuery.append(communityReportPageSql(communityId, status, page))
  reportQuery.append(sql` r
  `)
  reportQuery.append(reportTargetJoinsSql())
  reportQuery.append(sql`
    LEFT JOIN view_users_public reporter_profile ON reporter_profile.id = r.reporter_user_id
    LEFT JOIN view_users_public resolver_profile ON resolver_profile.id = r.resolved_by_id
    LEFT JOIN LATERAL (
      SELECT COUNT(DISTINCT rc.reporter_user_id)::integer AS report_count
      FROM moderation_reports rc
      -- One target FK per row. Keep all four keyed comparisons for shared UUIDs.
      WHERE (rc.post_id = r.post_id OR rc.reported_user_id = r.post_id
          OR rc.hostname_id = r.post_id OR rc.rss_feed_item_id = r.post_id)
        AND `)
  appendModerationReportStatusPredicate(reportQuery, 'rc', status)
  reportQuery.append(sql`
    ) report_counts ON true
    LEFT JOIN LATERAL (
      SELECT mj.recommended_action
      FROM moderation_report_judgements mj
      WHERE (mj.post_id = r.post_id OR mj.reported_user_id = r.post_id
          OR mj.hostname_id = r.post_id OR mj.rss_feed_item_id = r.post_id)
      ORDER BY mj.id DESC
      LIMIT 1
    ) latest_judgement ON true
  `)
  return reportQuery
}

// The page depends on live post ownership, report status and the cursor. Enrichment only
// changes the projection, so it can run after all of the eligibility predicates and the limit.
// The per-post limit keeps the existing ordered report lookups scoped to posts in this community.
// A report beyond its post's full page cannot appear in the community's page in the same order.
function communityReportPageSql(
  communityId: string,
  status: ModerationReportStatus,
  page: ReportQueuePage,
) {
  const query = sql`(
    SELECT mr.id, mr.created_at, mr.reviewed_at, mr.reporter_user_id,
      mr.post_id, mr.reported_user_id, mr.hostname_id, mr.rss_feed_item_id,
      mr.reason, mr.note, mr.resolved_by_id,
      mr.post_id AS entity_id,
      CASE WHEN p.post_type = 'comment' THEN 'comment' ELSE 'post' END::moderation_report_entity_types AS entity_type,
      `
  query.append(moderationReportStatusSql('mr'))
  query.append(sql` AS status
    FROM posts p
    JOIN LATERAL (
      SELECT mr.id, mr.created_at, mr.reviewed_at, mr.reporter_user_id,
        mr.post_id, mr.reported_user_id, mr.hostname_id, mr.rss_feed_item_id,
        mr.reason, mr.note, mr.resolved_by_id, mr.resolution_action
      FROM moderation_reports mr
      WHERE mr.post_id = p.id
        AND `)
  appendModerationReportStatusPredicate(query, 'mr', status)
  if (page.after) {
    const { afterCreatedAt, afterId } = page.after
    query.append(
      sql` AND (mr.created_at, mr.id) < (${afterCreatedAt}::timestamptz, ${afterId}::uuid)`,
    )
  }
  return query.append(sql` ORDER BY mr.created_at DESC, mr.id DESC LIMIT ${page.limit}
    ) mr ON true
    WHERE p.community_id = ${communityId}
    ORDER BY mr.created_at DESC, mr.id DESC LIMIT ${page.limit}
  )`)
}

// post_id is the review primary key. A scalar lookup keeps this page's approval probes keyed.
function communityQueuePostNotApprovedSql(postAlias: 'target_post' | 'root_post') {
  return sql``
    .append(
      `(${postAlias}.community_id IS NOT NULL AND COALESCE((SELECT false FROM community_post_reviews cpr_vis WHERE `,
    )
    .append(communityPostApprovalPredicateSql(postAlias))
    .append(sql`), true))`)
}
