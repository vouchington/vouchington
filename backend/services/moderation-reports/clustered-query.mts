import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getModerationReportsWorkLimit } from './work-limits.mts'
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
import type {
  ClusteredPendingModerationReport,
  ClusterRow,
  SelectClusterRowsOptions,
} from './clustered-types.mts'
import { appendCandidateCursorClause, groupReportsByCluster } from './clustered-utils.mts'
import { moderationReportClusterCandidatesSql } from './clustered-candidates.mts'
import {
  appendPageReportBranches,
  appendPageReportHeadBranches,
  appendSelectedReportBranches,
} from './clustered-page-report-sql.mts'
export function selectEntityClusterRows(options: SelectClusterRowsOptions): Promise<ClusterRow[]> {
  const { limit, status, sortAsc, beforeCursor, cursorDirection = 'after' } = options
  const reportCountCap = getModerationReportsWorkLimit('cluster_report_count_cap')
  const querySortAsc = cursorDirection === 'after' ? sortAsc : !sortAsc
  const query = sql`/* listClusteredModerationReports:clusters */
    WITH paged_entities AS (
      SELECT c.entity_type, c.entity_id,
        c.post_id, c.reported_user_id, c.hostname_id, c.rss_feed_item_id,
        c.first_reported_at, c.last_reported_at
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
    )
    SELECT
      g.entity_type,
      g.entity_id,
      report_sample.reports,
      report_sample.report_count,
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
  query.append(sql` AS target_is_restricted FROM paged_entities g
    JOIN LATERAL (
      SELECT COUNT(*)::integer AS report_count,
        jsonb_agg(jsonb_build_object('reporter_user_id', sample.reporter_user_id, 'reason', sample.reason)
          ORDER BY sample.id DESC) AS reports
      FROM (
  `)
  appendPageReportBranches(query, status, reportCountCap + 1)
  query.append(sql` LIMIT ${reportCountCap + 1}) sample
    ) report_sample ON true
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
  return read<
    ClusterRow & {
      reports: Array<{ reporter_user_id: string | null; reason: string }> | null
    }
  >(query).then(result =>
    result.rows.map(({ reports, report_count, ...row }) => {
      const sample = (reports ?? []).slice(0, reportCountCap)
      const reasons: Record<string, number> = {}
      for (const report of sample) reasons[report.reason] = (reasons[report.reason] ?? 0) + 1
      return {
        ...row,
        report_count: Math.min(report_count, reportCountCap),
        report_count_capped: report_count > reportCountCap,
        reporter_count: new Set(
          sample.flatMap(report => (report.reporter_user_id ? [report.reporter_user_id] : [])),
        ).size,
        reason_counts: reasons,
      }
    }),
  )
}

export async function selectReportsByCluster(
  status: ModerationReportStatus,
  clusters: ClusterRow[],
  sortAsc: boolean,
): Promise<Map<string, ClusteredPendingModerationReport[]>> {
  if (clusters.length === 0) return new Map()
  const query = sql`/* listClusteredModerationReports:reports */
    WITH selected_reports AS (`
  appendSelectedReportBranches(query, clusters, status, sortAsc)
  query.append(sql`) SELECT
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
      0::integer AS report_count,
      0::integer AS cursor_report_count,
      COALESCE(u.username = ${BAN_EVASION_SYSTEM_USERNAME}, false) AS is_system_generated,
      `)
  query.append(reportAutomaticJudgementEnabledSql()).append(sql` AS automatic_judgement_enabled, `)
  query.append(reportTargetIsRestrictedSql())
  query.append(sql` AS target_is_restricted
    FROM selected_reports selected
    JOIN `)
  query.append(moderationReportsWithEntitySql())
  query.append(sql` r ON r.id = selected.id
    LEFT JOIN users u ON u.id = r.reporter_user_id
    LEFT JOIN view_users_public reporter_profile ON reporter_profile.id = r.reporter_user_id
    LEFT JOIN view_users_public resolver_profile ON resolver_profile.id = r.resolved_by_id
  `)
  query.append(reportTargetJoinsSql())
  query.append(sql`
    ORDER BY r.entity_type, r.entity_id, r.id `)
  query.append(sortAsc ? sql`ASC` : sql`DESC`)
  const { rows } = await read<PendingModerationReport>(query)
  const clusterById = new Map(
    clusters.map(cluster => [`${cluster.entity_type}:${cluster.entity_id}`, cluster]),
  )
  const enriched = await enrichClusteredReports(rows)
  return groupReportsByCluster(
    enriched.map(report => {
      const cluster = clusterById.get(`${report.entity_type}:${report.entity_id}`)!
      return {
        ...report,
        report_count: cluster.report_count,
        cursor_report_count: cluster.report_count,
        report_count_capped: cluster.report_count_capped,
      }
    }),
  )
}
