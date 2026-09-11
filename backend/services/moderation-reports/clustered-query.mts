import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { BAN_EVASION_SYSTEM_USERNAME } from '@services/users/constants'
import type { ModerationReportStatus } from './config.mts'
import type { PendingModerationReport } from './get.mts'
import { enrichClusteredReports } from './clustered-report-enrichment.mts'
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
const MAX_REPORTS_PER_CLUSTER = 25
export function selectEntityClusterRows(options: SelectClusterRowsOptions): Promise<ClusterRow[]> {
  const { limit, status, sortAsc, beforeCursor, cursorDirection = 'after' } = options
  const querySortAsc = cursorDirection === 'after' ? sortAsc : !sortAsc
  const query = sql`/* listClusteredModerationReports:clusters */
    WITH candidate_entities AS (
      SELECT DISTINCT ON (r.entity_type, r.entity_id)
        r.entity_type,
        r.entity_id,
        r.created_at AS sort_reported_at
      FROM `
  query.append(moderationReportsWithEntitySql())
  query.append(sql` r
      WHERE `)
  appendModerationReportStatusPredicate(query, 'r', status)
  query.append(sql`
      ORDER BY r.entity_type, r.entity_id, `)
  query.append(sortAsc ? sql`r.created_at ASC, r.id ASC` : sql`r.created_at DESC, r.id DESC`)
  query.append(sql`
    ),
    paged_entities AS (
      SELECT c.entity_type, c.entity_id
      FROM candidate_entities c
      WHERE true`)
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
        COUNT(*)::int AS report_count,
        COUNT(DISTINCT r.reporter_user_id)::int AS reporter_count,
        MIN(r.created_at) AS first_reported_at,
        MAX(r.created_at) AS last_reported_at
      FROM paged_entities p
      JOIN `)
  query.append(moderationReportsWithEntitySql())
  query.append(sql` r
        ON r.entity_type = p.entity_type
        AND r.entity_id = p.entity_id
        AND `)
  appendModerationReportStatusPredicate(query, 'r', status)
  query.append(sql`
      GROUP BY p.entity_type, p.entity_id
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
          FROM `)
  query.append(moderationReportsWithEntitySql())
  query.append(sql` rr
          WHERE rr.entity_type = g.entity_type
            AND rr.entity_id = g.entity_id
            AND `)
  appendModerationReportStatusPredicate(query, 'rr', status)
  query.append(sql`
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
  query.append(sql` AS target_is_restricted
    FROM entity_groups g
    JOIN LATERAL (
      SELECT *
      FROM `)
  query.append(moderationReportsWithEntitySql())
  query.append(sql` r
      WHERE r.entity_type = g.entity_type
        AND r.entity_id = g.entity_id
        AND `)
  appendModerationReportStatusPredicate(query, 'r', status)
  query.append(sql`
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT 1
    ) r ON true
  `)
  query.append(reportTargetJoinsSql())
  query.append(sql` WHERE true`)
  query.append(sql` ORDER BY `)
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
          ORDER BY r.created_at `
  query.append(sortAsc ? sql`ASC, r.id ASC` : sql`DESC, r.id DESC`)
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
      u.username AS reporter_username,
      r.entity_type,
      r.entity_id,
  `)
  appendReportTargetColumns(query, { includeAvailable: true })
  query.append(sql`,
      r.reason,
      r.note,
      r.status,
      r.resolved_by_id,
      report_counts.report_count,
      report_counts.report_count AS cursor_report_count,
      COALESCE(u.username = ${BAN_EVASION_SYSTEM_USERNAME}, false) AS is_system_generated,
      `)
  query.append(reportTargetIsRestrictedSql())
  query.append(sql` AS target_is_restricted
    FROM ranked_reports r
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
    ) report_counts ON true
  `)
  query.append(sql`
    WHERE r.report_rank <= ${MAX_REPORTS_PER_CLUSTER}
    ORDER BY r.entity_type, r.entity_id, r.created_at `)
  query.append(sortAsc ? sql`ASC, r.id ASC` : sql`DESC, r.id DESC`)
  const { rows } = await read<PendingModerationReport>(query)
  const reports = await enrichClusteredReports(rows)
  return groupReportsByCluster(reports)
}
