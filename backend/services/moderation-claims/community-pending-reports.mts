import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  appendReportTargetColumns,
  moderationReportsWithEntitySql,
  reportTargetAvailableSql,
  reportTargetIsRestrictedSql,
  reportTargetJoinsSql,
} from '@services/moderation-reports/target-metadata'
import { attachJudgements } from '@services/moderation-reports/judgement-attach'
import { attachPostModerationContext } from '@services/moderation-reports/post-moderation-context-attach'
import { attachBanEvasionContext } from '@services/moderation-reports/ban-evasion-context-attach'
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
  const pageRows = mergedRows.slice(0, limit)
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
      NULL::text AS reporter_username,
      r.entity_type,
      r.entity_id,
  `
  appendReportTargetColumns(query, { includeAvailable: true })
  query.append(sql`,
      r.reason,
      r.note,
      r.status,
      r.resolved_by_id,
      r.escalated_at,
      r.escalated_by_id,
      false AS is_system_generated,
      report_counts.report_count,
      report_counts.report_count AS cursor_report_count,
      `)
  query.append(severityRankSql())
  query.append(sql` AS cursor_severity_rank,
      `)
  query.append(reportTargetIsRestrictedSql())
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
    FROM `)
  query.append(moderationReportsWithEntitySql())
  query.append(sql` r
  `)
  query.append(reportTargetJoinsSql())
  query.append(sql`
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::integer AS report_count
      FROM moderation_reports rc
      WHERE COALESCE(rc.post_id, rc.reported_user_id, rc.hostname_id, rc.rss_feed_item_id)
              = COALESCE(r.post_id, r.reported_user_id, r.hostname_id, r.rss_feed_item_id)
        AND rc.reviewed_at IS NULL
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
  query.append(sql`
    WHERE r.reviewed_at IS NULL
      AND r.post_id IS NOT NULL
      AND target_post.community_id = ${communityId}
      AND `)
  query.append(reportTargetAvailableSql())
  if (escalated === true) {
    query.append(sql` AND r.escalated_at IS NOT NULL`)
  }
  if (afterCursor) appendModerationReportCursorPredicate(query, sort ?? 'severity', afterCursor)
  appendModerationReportOrder(query, sort ?? 'severity', limit)

  const { rows } = await read(query)
  return rows as PendingModerationReport[]
}
