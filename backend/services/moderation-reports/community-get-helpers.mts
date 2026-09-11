import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { BAN_EVASION_SYSTEM_USERNAME } from '@services/users/constants'
import type { PendingModerationReport } from './get.mts'
import type { ModerationReportCursor, ModerationReportSort } from './sort-sql.mts'

export function sortMergedReports(
  rows: PendingModerationReport[],
  sort: ModerationReportSort,
): PendingModerationReport[] {
  return rows.slice().sort((a, b) => {
    if (sort === 'severity') {
      if (b.cursor_severity_rank !== a.cursor_severity_rank)
        return b.cursor_severity_rank - a.cursor_severity_rank
      if (b.cursor_report_count !== a.cursor_report_count)
        return b.cursor_report_count - a.cursor_report_count
    } else if (sort === 'most_reported') {
      if (b.cursor_report_count !== a.cursor_report_count)
        return b.cursor_report_count - a.cursor_report_count
    }
    const asc = sort === 'created_at_asc'
    if (a.cursor_created_at !== b.cursor_created_at)
      return asc
        ? a.cursor_created_at < b.cursor_created_at
          ? -1
          : 1
        : a.cursor_created_at > b.cursor_created_at
          ? -1
          : 1
    return asc ? (a.id < b.id ? -1 : 1) : a.id > b.id ? -1 : 1
  })
}

export async function fetchBanEvasionReports(
  communityId: string,
  limit: number,
  sort?: ModerationReportSort,
  afterCursor?: ModerationReportCursor,
): Promise<PendingModerationReport[]> {
  const query = sql`/* fetchBanEvasionReports */
    SELECT
      r.id,
      r.created_at,
      to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at,
      r.reviewed_at,
      r.reporter_user_id,
      NULL::text AS reporter_username,
      'user'::moderation_report_entity_type AS entity_type,
      r.reported_user_id AS entity_id,
      COALESCE('@' || tu.username, 'User ' || r.reported_user_id::text) AS target_label,
      NULL::jsonb AS target_content,
      '/user/' || COALESCE(tu.username, r.reported_user_id::text) AS target_path,
      '/user/' || COALESCE(tu.username, r.reported_user_id::text) || '/admin' AS admin_action_path,
      r.reported_user_id::text AS target_user_id,
      (tu.id IS NOT NULL AND tu.deleted_at IS NULL) AS target_available,
      r.reason,
      r.note,
      -- Pending by construction: the WHERE clause below requires r.reviewed_at IS NULL.
      'pending'::text AS status,
      r.resolved_by_id,
      NULL::timestamptz AS escalated_at,
      NULL::uuid AS escalated_by_id,
      true AS is_system_generated,
      1 AS report_count,
      1 AS cursor_report_count,
      0 AS cursor_severity_rank,
      false AS target_is_restricted,
      false AS target_is_anonymous,
      false AS target_pending_community_review
    FROM moderation_reports r
    JOIN users ban_sys ON ban_sys.id = r.reporter_user_id AND ban_sys.username = ${BAN_EVASION_SYSTEM_USERNAME}
    JOIN community_members cm
      ON cm.user_id = r.reported_user_id
      AND cm.community_id = ${communityId}
      AND cm.suspected_ban_evader_at IS NOT NULL
      AND cm.suspected_ban_evader_dismissed_at IS NULL
      AND cm.removed_at IS NULL
    LEFT JOIN users tu ON tu.id = r.reported_user_id
    WHERE r.reviewed_at IS NULL
      AND r.reported_user_id IS NOT NULL
  `
  if (afterCursor) {
    if (sort === 'severity') {
      const severityRank = afterCursor.severityRank ?? 0
      const reportCount = afterCursor.reportCount ?? 0
      query.append(
        sql` AND (0 < ${severityRank} OR (0 = ${severityRank} AND (1 < ${reportCount} OR (1 = ${reportCount} AND r.id > ${afterCursor.id}::uuid))))`,
      )
    } else if (sort === 'most_reported') {
      const reportCount = afterCursor.reportCount ?? 0
      query.append(
        sql` AND (1 < ${reportCount} OR (1 = ${reportCount} AND r.id > ${afterCursor.id}::uuid))`,
      )
    } else {
      const comparator = sort === 'created_at_asc' ? sql`>` : sql`<`
      query.append(sql` AND r.id `)
      query.append(comparator)
      query.append(sql` ${afterCursor.id}::uuid`)
    }
  }
  const direction = sort === 'created_at_asc' ? sql` ASC` : sql` DESC`
  query.append(sql` ORDER BY r.id`)
  query.append(direction)
  query.append(sql` LIMIT ${limit}`)
  const { rows } = await read(query)
  return rows as PendingModerationReport[]
}
