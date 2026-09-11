import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { BAN_EVASION_SYSTEM_USERNAME } from '@services/users/constants'
import type {
  ModerationReport,
  ModerationReportStatus,
  CommunityBanEvasionContext,
} from './config.mts'
import {
  appendReportTargetColumns,
  moderationReportsWithEntitySql,
  reportTargetIsRestrictedSql,
  reportTargetJoinsSql,
  type ModerationReportTargetContent,
} from './target-metadata.mts'
import { applyDeletedTargetLabel } from './redaction.mts'
import { attachJudgements, type FullJudgementSummary } from './judgement-attach.mts'
import {
  attachPostModerationContext,
  type PostModerationContext,
} from './post-moderation-context-attach.mts'
import {
  appendModerationReportCursorPredicate,
  appendModerationReportOrder,
  appendModerationReportStatusPredicate,
  assertMutableSortCursorIsCurrent,
  severityRankSql,
  type ModerationReportCursor,
  type ModerationReportSort,
} from './sort-sql.mts'
import { attachBanEvasionContext } from './ban-evasion-context-attach.mts'

export type { CommunityBanEvasionContext }
export type PendingModerationReport = ModerationReport & {
  cursor_created_at: string
  admin_action_path: string | null
  target_label: string | null
  target_content: ModerationReportTargetContent | null
  target_path: string | null
  target_user_id: string | null
  target_available: boolean | null
  /** True when the target is a private-community or non-public (followers-only/private) post/comment. */
  target_is_restricted: boolean
  report_count: number
  cursor_report_count: number
  cursor_severity_rank: number
  judgement: FullJudgementSummary | null
  /** Full moderation context for post/comment targets (staff tier). Null for other entity types. */
  post_moderation_context: PostModerationContext | null
  /** True for post reports whose target still has no approved community publication row. */
  target_pending_community_review?: boolean
  /** True when the target post was submitted anonymously. */
  target_is_anonymous?: boolean
  is_system_generated: boolean
  /** Ban-evasion flag context for user-entity reports. */
  community_ban_evasion?: CommunityBanEvasionContext | null
}
/** Redacted view: omits reporter identity, note, resolved_by_id, admin path, and the AI
 * judgement (staff-only, since its public_response is derived from reporter notes). */
export type RedactedModerationReport = Omit<
  PendingModerationReport,
  | 'reporter_user_id'
  | 'reporter_username'
  | 'note'
  | 'resolved_by_id'
  | 'admin_action_path'
  | 'target_is_restricted'
  | 'target_user_id'
  | 'judgement'
  | 'community_ban_evasion'
  | 'is_system_generated'
>

export type ListModerationReportsOptions = {
  limit: number
  status?: ModerationReportStatus
  sort?: ModerationReportSort
  beforeCursor?: ModerationReportCursor
  cursorDirection?: 'after' | 'before'
  excludeSystemGenerated?: boolean
}

export async function listModerationReports(options: ListModerationReportsOptions) {
  const {
    limit,
    status = 'pending',
    sort = 'severity',
    beforeCursor,
    cursorDirection = 'after',
    excludeSystemGenerated = false,
  } = options
  if (beforeCursor) {
    await assertMutableSortCursorIsCurrent(beforeCursor, sort, status, { excludeSystemGenerated })
  }

  const query = sql`/* listModerationReports */
    SELECT
      r.id,
      r.case_id,
      r.created_at,
      to_char(
        r.created_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ) AS cursor_created_at,
      r.reviewed_at,
      r.reporter_user_id,
      u.username AS reporter_username,
      r.entity_type,
      r.entity_id,
  `
  appendReportTargetColumns(query, { includeAvailable: true })
  query.append(sql`,
      r.reason,
      r.note,
      r.status,
      r.resolved_by_id,
      report_counts.report_count,
      report_counts.report_count AS cursor_report_count,
      `)
  query.append(severityRankSql())
  query.append(sql` AS cursor_severity_rank,
      /* Keep the redaction contract boolean if reporter joins ever become nullable. */
      COALESCE(u.username = ${BAN_EVASION_SYSTEM_USERNAME}, false) AS is_system_generated,
      `)
  query.append(reportTargetIsRestrictedSql())
  query.append(sql` AS target_is_restricted
    FROM `)
  query.append(moderationReportsWithEntitySql())
  query.append(sql` r
    LEFT JOIN users u ON u.id = r.reporter_user_id
  `)
  query.append(reportTargetJoinsSql())
  query.append(sql`
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::integer AS report_count
      FROM moderation_reports rc
      WHERE COALESCE(rc.post_id, rc.reported_user_id, rc.hostname_id, rc.rss_feed_item_id)
              = COALESCE(r.post_id, r.reported_user_id, r.hostname_id, r.rss_feed_item_id)
        AND `)
  appendModerationReportStatusPredicate(query, 'rc', status)
  query.append(sql`
  `)
  if (excludeSystemGenerated) {
    query.append(sql`
        AND NOT EXISTS (
          SELECT 1
          FROM users rcu
          WHERE rcu.id = rc.reporter_user_id
            AND rcu.username = ${BAN_EVASION_SYSTEM_USERNAME}
        )
    `)
  }
  query.append(sql`
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
    WHERE `)
  appendModerationReportStatusPredicate(query, 'r', status)
  query.append(sql`
  `)
  if (excludeSystemGenerated) {
    query.append(sql`
      AND u.username IS DISTINCT FROM ${BAN_EVASION_SYSTEM_USERNAME}
    `)
  }
  if (beforeCursor) {
    appendModerationReportCursorPredicate(query, sort, beforeCursor, cursorDirection)
  }
  appendModerationReportOrder(query, sort, limit + 1, cursorDirection === 'before')

  const { rows } = await read(query)
  const hasNextPage = rows.length > limit
  let pageRows = hasNextPage
    ? (rows as PendingModerationReport[]).slice(0, limit)
    : (rows as PendingModerationReport[])
  if (cursorDirection === 'before') pageRows = pageRows.toReversed()
  // ast-grep-ignore: no-three-sequential-awaits -- each enrichment step depends on the previous result
  const withJudgements = await attachJudgements(pageRows.map(applyDeletedTargetLabel))
  const withContext = await attachPostModerationContext(withJudgements, 'staff')
  const reports = await attachBanEvasionContext(withContext)
  return {
    reports,
    hasNextPage: cursorDirection === 'before' ? Boolean(beforeCursor) : hasNextPage,
    hasPreviousPage: cursorDirection === 'before' ? hasNextPage : Boolean(beforeCursor),
  }
}
export function listPendingModerationReports(options: {
  limit: number
  beforeCursor?: { id: string } | null
}): Promise<{ reports: PendingModerationReport[]; hasNextPage: boolean }> {
  return listModerationReports({ ...options, sort: 'created_at_desc', status: 'pending' })
}
