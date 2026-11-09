import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { BAN_EVASION_SYSTEM_USERNAME } from '@services/users/constants'
import type { ModerationReportStatus } from './config.mts'
import type { PendingModerationReport } from './pending-moderation-report.mts'
import { enrichClusteredReports } from './clustered-report-enrichment.mts'
import { reportAutomaticJudgementEnabledSql } from './automatic-judgement-eligibility.mts'
import {
  appendReportTargetColumns,
  moderationReportsWithEntitySql,
  reportTargetIsRestrictedSql,
  reportTargetJoinsSql,
} from './target-metadata.mts'
import type { ClusterRow, SelectClusterRowsOptions } from './clustered-types.mts'
import {
  appendCandidateCursorClause,
  appendClusterWhereClause,
  groupReportsByCluster,
} from './clustered-utils.mts'
import { appendModerationReportStatusPredicate } from './sort-sql.mts'
import { moderationReportClusterCandidatesSql } from './clustered-candidates.mts'
import {
  appendPageReportBranches,
  appendPageReportHeadBranches,
} from './clustered-page-report-sql.mts'
const MAX_REPORTS_PER_CLUSTER = 25
export function selectEntityClusterRows(options: SelectClusterRowsOptions): Promise<ClusterRow[]> {
  const { limit, status, sortAsc, beforeCursor, cursorDirection = 'after' } = options
  const querySortAsc = cursorDirection === 'after' ? sortAsc : !sortAsc
  const query = sql`/* listClusteredModerationReports:clusters */
    WITH paged_entities AS (
      SELECT c.entity_type, c.entity_id,
        c.post_id, c.reported_user_id, c.hostname_id, c.rss_feed_item_id
      FROM `
  query.append(moderationReportClusterCandidatesSql(sortAsc))
  query.append(sql` c WHERE `)
  query.append(
    status === 'pending'
      ? sql`c.resolution_action IS NULL`
      : sql`c.resolution_action = ${status}::moderation_report_resolution_actions`,
  )
  if (beforeCursor) appendCandidateCursorClause(query, beforeCursor, sortAsc, cursorDirection)
  query.append(
    querySortAsc
      ? sql` ORDER BY c.sort_reported_at ASC, c.entity_id ASC, c.entity_type ASC LIMIT ${limit + 1}`
      : sql` ORDER BY c.sort_reported_at DESC, c.entity_id DESC, c.entity_type DESC LIMIT ${limit + 1}`,
  )
  query.append(sql`
    ),
    entity_groups AS (
      SELECT
        p.entity_type,
        p.entity_id,
        p.post_id, p.reported_user_id, p.hostname_id, p.rss_feed_item_id,
        COUNT(*)::int AS report_count,
        COUNT(DISTINCT r.reporter_user_id)::int AS reporter_count,
        MIN(r.created_at) AS first_reported_at,
        MAX(r.created_at) AS last_reported_at
      FROM paged_entities p
      JOIN LATERAL (`)
  appendPageReportBranches(query, 'p', status)
  query.append(sql`) r ON true
      GROUP BY p.entity_type, p.entity_id, p.post_id, p.reported_user_id,
        p.hostname_id, p.rss_feed_item_id
    )
    SELECT
      g.entity_type,
      g.entity_id,
      g.report_count,
      g.reporter_count,
      (
        SELECT jsonb_object_agg(reason_rows.reason, reason_rows.report_count)
        FROM (
          SELECT rr.reason, COUNT(*)::int AS report_count
          FROM LATERAL (`)
  appendPageReportBranches(query, 'g', status)
  query.append(sql`) rr
          GROUP BY rr.reason
        ) reason_rows
      ) AS reason_counts,
      g.first_reported_at,
      g.last_reported_at,
      to_char(`)
  query.append(sortAsc ? sql`g.first_reported_at` : sql`g.last_reported_at`)
  query.append(sql` AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at,
      `)
  appendReportTargetColumns(query, { includeAvailable: true })
  query.append(sql`,
      `)
  query.append(reportTargetIsRestrictedSql())
  query.append(sql` AS target_is_restricted FROM entity_groups g
    JOIN LATERAL (`)
  appendPageReportHeadBranches(query, status)
  query.append(sql`) head ON true
    JOIN `)
  query.append(moderationReportsWithEntitySql())
  query.append(sql` r ON r.id = head.id
  `)
  query.append(reportTargetJoinsSql())
  query.append(sql` WHERE true ORDER BY `)
  query.append(sortAsc ? sql`g.first_reported_at` : sql`g.last_reported_at`)
  query.append(querySortAsc ? sql` ASC, ` : sql` DESC, `)
  query.append(
    querySortAsc
      ? sql`g.entity_id ASC, g.entity_type ASC`
      : sql`g.entity_id DESC, g.entity_type DESC`,
  )
  query.append(sql` LIMIT ${limit + 1}`)
  return read<ClusterRow>(query).then(result => result.rows)
}

export async function selectReportsByCluster(
  status: ModerationReportStatus,
  clusters: ClusterRow[],
  sortAsc: boolean,
): Promise<Map<string, PendingModerationReport[]>> {
  if (clusters.length === 0) return new Map()
  const query = sql`/* listClusteredModerationReports:reports */
    WITH ranked_reports AS (
      SELECT
        r.*,
        ROW_NUMBER() OVER (
          PARTITION BY r.entity_type, r.entity_id
          ORDER BY r.id `
  query.append(sortAsc ? sql`ASC` : sql`DESC`)
  query.append(sql`
        ) AS report_rank
      FROM `)
  query.append(moderationReportsWithEntitySql())
  query.append(sql` r
      WHERE `)
  appendModerationReportStatusPredicate(query, 'r', status)
  query.append(sql` AND (`)
  appendClusterWhereClause(query, clusters)
  query.append(sql`)) SELECT
      r.id,
      r.case_id,
      r.created_at,
      to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at,
      r.reviewed_at,
      r.reporter_user_id,
      reporter_profile.username AS reporter_username,
      reporter_profile.verified_display_name AS reporter_display_name,
      r.entity_type,
      r.entity_id,
  `)
  appendReportTargetColumns(query, { includeAvailable: true })
  query.append(sql`,
      r.reason,
      r.note,
      r.status,
      r.resolved_by_id,
      resolver_profile.username AS resolver_username,
      resolver_profile.verified_display_name AS resolver_display_name,
      report_counts.report_count,
      report_counts.report_count AS cursor_report_count,
      COALESCE(u.username = ${BAN_EVASION_SYSTEM_USERNAME}, false) AS is_system_generated,
      `)
  query.append(reportAutomaticJudgementEnabledSql()).append(sql` AS automatic_judgement_enabled, `)
  query.append(reportTargetIsRestrictedSql())
  query.append(sql` AS target_is_restricted
    FROM ranked_reports r
    LEFT JOIN users u ON u.id = r.reporter_user_id
    LEFT JOIN view_users_public reporter_profile ON reporter_profile.id = r.reporter_user_id
    LEFT JOIN view_users_public resolver_profile ON resolver_profile.id = r.resolved_by_id
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
    ) report_counts ON true
  `)
  query.append(sql`
    WHERE r.report_rank <= ${MAX_REPORTS_PER_CLUSTER}
    ORDER BY r.entity_type, r.entity_id, r.id `)
  query.append(sortAsc ? sql`ASC` : sql`DESC`)
  const { rows } = await read<PendingModerationReport>(query)
  return groupReportsByCluster(await enrichClusteredReports(rows))
}
