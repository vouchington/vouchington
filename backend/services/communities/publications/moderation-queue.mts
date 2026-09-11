import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  appendReportTargetColumns,
  communityPostNotApprovedSql,
  moderationReportsWithEntitySql,
  reportTargetJoinsSql,
  type ModerationReportTargetContent,
} from '@services/moderation-reports/target-metadata'
import type { ModerationReportStatus } from '@services/moderation-reports/config'
import type { PendingModerationReport } from '@services/moderation-reports/get'
import { appendModerationReportStatusPredicate } from '@services/moderation-reports/sort-sql'
import { applyDeletedTargetLabel } from '@services/moderation-reports/redaction'
import { attachJudgements } from '@services/moderation-reports/judgement-attach'
import { attachPostModerationContext } from '@services/moderation-reports/post-moderation-context-attach'
import { decodeCommunityModerationQueueCursor } from './moderation-queue-cursor.mts'
import { buildCommunityReviewQueueQuery } from './moderation-queue-review-sql.mts'
export { encodeCommunityModerationQueueCursor } from './moderation-queue-cursor.mts'

export type CommunityModerationQueueEntry = PendingModerationReport & {
  queue_source: 'report' | 'community_review'
  /** Kept explicit so API-contract extraction retains the JSON object rather than its SQL origin. */
  target_content: ModerationReportTargetContent | null
  /** True for private/followers-only targets; the route masks these for member-tier viewers. */
  target_is_restricted: boolean
  /** True when the target post was submitted anonymously; used to redact target_user_id
   * for non-site-staff viewers so the author UUID is not exposed. */
  target_is_anonymous: boolean
}

export type SearchCommunityModerationQueueOptions = {
  status?: ModerationReportStatus
  limit?: number
  after?: string | null
  /**
   * Whether to include pre-publication `community_post_reviews` rows.
   * Only moderator-tier viewers may see unpublished post titles/paths.
   */
  includePendingReviews?: boolean
  /** Viewer tier for post_moderation_context: moderators get full context; members get coarse. */
  viewerTier?: 'moderator' | 'member'
}

export type CommunityModerationQueueResult = {
  entries: CommunityModerationQueueEntry[]
  hasNextPage: boolean
}

/**
 * Returns a UNION of community moderation reports + community_post_reviews pending rows,
 * ordered by created_at DESC. Member-tier viewers receive a redacted result set.
 */
export async function searchCommunityModerationQueue(
  communityId: string,
  options: SearchCommunityModerationQueueOptions,
): Promise<CommunityModerationQueueResult> {
  const {
    status = 'pending',
    limit: rawLimit = 50,
    after,
    includePendingReviews = true,
    viewerTier = 'moderator',
  } = options
  const limit = Math.min(Math.max(Math.floor(rawLimit), 1), 100)

  const decoded = after ? decodeCommunityModerationQueueCursor(after) : null
  const afterCreatedAt = decoded?.afterCreatedAt ?? null
  const afterId = decoded?.afterId ?? null
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

  const reviewQuery = buildCommunityReviewQueueQuery(communityId)

  const unionQuery = sql`/* searchCommunityModerationQueue */
    SELECT * FROM (`
  unionQuery.append(reportQuery)
  // Pre-publication reviews expose unpublished post titles/paths; moderator-tier only.
  if (includePendingReviews) {
    unionQuery.append(sql` UNION ALL `)
    unionQuery.append(reviewQuery)
  }
  unionQuery.append(sql`) combined`)

  if (afterCreatedAt && afterId) {
    unionQuery.append(
      sql` WHERE (created_at, id) < (${afterCreatedAt}::timestamptz, ${afterId}::uuid)`,
    )
  }

  unionQuery.append(sql` ORDER BY created_at DESC, id DESC LIMIT ${limit + 1}`)

  const { rows } = await read(unionQuery)
  const hasNextPage = rows.length > limit
  // Soft-deleted report targets render as "[deleted content]" with no dead links,
  // matching the global queue (applyDeletedTargetLabel preserves the queue_source field).
  const pageRows = hasNextPage
    ? (rows as CommunityModerationQueueEntry[]).slice(0, limit)
    : (rows as CommunityModerationQueueEntry[])
  const labelled = pageRows.map(row => ({
    ...applyDeletedTargetLabel(row),
    queue_source: row.queue_source,
    target_is_restricted: row.target_is_restricted,
    target_is_anonymous: row.target_is_anonymous,
  }))
  const withJudgements = await attachJudgements(labelled)
  const contextTier = viewerTier === 'moderator' ? 'staff' : 'public'
  const entries = await attachPostModerationContext(withJudgements, contextTier)
  return { entries, hasNextPage }
}
