import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { reportAutomaticJudgementEnabledSql } from '@services/moderation-reports/automatic-judgement-eligibility'
import {
  appendReportTargetColumns,
  reportTargetIsRestrictedSql,
  reportTargetJoinsSql,
} from '@services/moderation-reports/target-metadata'
import { attachJudgements } from '@services/moderation-reports/judgement-attach'
import { attachPostModerationContext } from '@services/moderation-reports/post-moderation-context-attach'
import { attachBanEvasionContext } from '@services/moderation-reports/ban-evasion-context-attach'
import { applyDeletedTargetLabel } from '@services/moderation-reports/deleted-target-label'
import type { PendingModerationReport } from '@services/moderation-reports/get'
import {
  appendModerationReportCursorPredicate,
  appendModerationReportOrder,
  severityRankSql,
  type ModerationReportCursor,
  type ModerationReportSort,
} from '@services/moderation-reports/sort-sql'
import {
  fetchBanEvasionReports,
  sortMergedReports,
} from '@services/moderation-reports/community-get-helpers'
import { attachReportClaims } from './get.mts'
import type { ModerationQueueClaim } from './types.mts'

export type CommunityPendingModerationReport = PendingModerationReport & {
  escalated_at: Date | null
  escalated_by_id: string | null
  claim: ModerationQueueClaim | null
}

export async function listCommunityPendingModerationReports(options: {
  communityId: string
  limit?: number
  sort?: ModerationReportSort
  escalated?: boolean
  afterCursor?: ModerationReportCursor
}): Promise<{
  reports: CommunityPendingModerationReport[]
  hasNextPage: boolean
}> {
  const limit =
    typeof options.limit === 'number' && Number.isFinite(options.limit)
      ? Math.min(Math.max(Math.floor(options.limit), 1), 100)
      : 50
  const sort = options.sort ?? 'severity'
  const [postCommentRows, banEvasionRows] = await Promise.all([
    fetchPostCommentReports(
      options.communityId,
      limit + 1,
      sort,
      options.escalated,
      options.afterCursor,
    ),
    fetchBanEvasionReports(options.communityId, limit + 1, sort, options.afterCursor),
  ])
  const mergedRows = sortMergedReports([...postCommentRows, ...banEvasionRows], sort)
  const hasNextPage = mergedRows.length > limit
  const pageRows = mergedRows.slice(0, limit).map(applyDeletedTargetLabel)
  const reports = (await attachJudgements(pageRows)
    .then(rows => attachPostModerationContext(rows, 'staff'))
    .then(rows => attachBanEvasionContext(rows, { communityId: options.communityId }))
    .then(rows => attachReportClaims(rows))) as CommunityPendingModerationReport[]
  return { reports, hasNextPage }
}

async function fetchPostCommentReports(
  communityId: string,
  limit: number,
  sort?: ModerationReportSort,
  escalated?: boolean,
  afterCursor?: ModerationReportCursor,
): Promise<PendingModerationReport[]> {
  const query = sql`/* listCommunityPendingModerationReports */
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
  appendReportTargetColumns(query, { includeAvailable: true })
  query.append(sql`,
      r.reason,
      r.note,
      r.status,
      r.resolved_by_id,
      NULL::text AS resolver_username,
      NULL::text AS resolver_display_name,
      r.escalated_at,
      r.escalated_by_id,
      false AS is_system_generated,
      report_counts.report_count,
      report_counts.report_count AS cursor_report_count,
      `)
  query.append(reportAutomaticJudgementEnabledSql())
  query.append(sql` AS automatic_judgement_enabled,
      `)
  query.append(severityRankSql())
  query.append(sql` AS cursor_severity_rank,
      `)
  // Check only the selected report's post or root review instead of hashing the review table.
  query.append(reportTargetIsRestrictedSql({ useKeyedReviewProbe: true }))
  // The per-post order keeps the pending scan keyed by the post in both plan modes.
  // Severity and report-count sorts still rank every eligible report in the community.
  query.append(sql` AS target_is_restricted,
      COALESCE(target_post.is_anonymous, false) AS target_is_anonymous,
      CASE WHEN r.post_id IS NOT NULL AND (target_post.post_type IS NULL OR target_post.post_type != 'comment') THEN EXISTS (
        SELECT 1
        FROM community_post_reviews cpr_pending
        WHERE cpr_pending.community_id = target_post.community_id
          AND cpr_pending.post_id = target_post.id
          AND cpr_pending.approved_at IS NULL
          AND cpr_pending.rejected_at IS NULL
          AND cpr_pending.unpublished_at IS NULL
      ) ELSE false END AS target_pending_community_review
    FROM (
      SELECT
        report.id, report.created_at, report.reviewed_at, report.reporter_user_id,
        report.reason, report.note, report.resolved_by_id, report.escalated_at, report.escalated_by_id,
        community_post.id AS post_id,
        NULL::uuid AS reported_user_id, NULL::uuid AS hostname_id, NULL::uuid AS rss_feed_item_id,
        'pending'::text AS status,
        community_post.id AS entity_id,
        (CASE WHEN community_post.post_type = 'comment' THEN 'comment'
          ELSE 'post' END)::moderation_report_entity_types AS entity_type
      FROM posts community_post
      CROSS JOIN LATERAL (
        SELECT mr.id, mr.created_at, mr.reviewed_at, mr.reporter_user_id, mr.reason, mr.note,
          mr.resolved_by_id, mr.escalated_at, mr.escalated_by_id
        FROM moderation_reports mr
        WHERE mr.post_id = community_post.id
          AND mr.reviewed_at IS NULL
          AND mr.resolution_action IS NULL
        ORDER BY mr.id DESC
      ) report
      WHERE community_post.community_id = ${communityId}
        AND community_post.deleted_at IS NULL
    ) r
  `)
  query.append(reportTargetJoinsSql())
  // Keep matches across all target types when their UUIDs happen to be equal.
  query.append(sql`
    LEFT JOIN view_users_public reporter_profile ON reporter_profile.id = r.reporter_user_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::integer AS report_count
      FROM moderation_reports rc
      WHERE rc.reviewed_at IS NULL
        AND rc.resolution_action IS NULL
        AND (
          rc.post_id = r.post_id OR rc.reported_user_id = r.post_id
          OR rc.hostname_id = r.post_id OR rc.rss_feed_item_id = r.post_id
        )
    ) report_counts ON true
    LEFT JOIN LATERAL (
      SELECT mj.recommended_action
      FROM moderation_report_judgements mj
      WHERE mj.post_id = r.post_id OR mj.reported_user_id = r.post_id
        OR mj.hostname_id = r.post_id OR mj.rss_feed_item_id = r.post_id
      ORDER BY mj.id DESC
      LIMIT 1
    ) latest_judgement ON true
  `)
  query.append(sql` WHERE true`)
  if (escalated === true) {
    query.append(sql` AND r.escalated_at IS NOT NULL`)
  }
  const reportSort = sort ?? 'severity'
  if (afterCursor)
    appendModerationReportCursorPredicate(query, reportSort, afterCursor, 'after', 'desc')
  appendModerationReportOrder(query, reportSort, limit, false, 'desc')

  const { rows } = await read<PendingModerationReport>(query)
  return rows
}
