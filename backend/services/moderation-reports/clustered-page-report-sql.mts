import sql, { type SQLStatement } from 'sql-template-strings'
import type { ClusterRow } from './clustered-types.mts'
import type { ModerationReportStatus } from './config.mts'
import { appendModerationReportStatusPredicate } from './sort-sql.mts'

const TARGET_COLUMNS = ['post_id', 'reported_user_id', 'hostname_id', 'rss_feed_item_id'] as const

/** Each page target has one FK; separate branches keep every lookup on that FK's index. */
export function appendPageReportBranches(
  query: SQLStatement,
  status: ModerationReportStatus,
  sampleLimit: number,
): void {
  for (const [index, targetColumn] of TARGET_COLUMNS.entries()) {
    if (index > 0) query.append(sql` UNION ALL `)
    query.append(sql`(SELECT r.id, r.reporter_user_id, r.reason FROM moderation_reports r WHERE `)
    query.append(`g.${targetColumn} IS NOT NULL AND r.${targetColumn} = g.${targetColumn} AND `)
    appendModerationReportStatusPredicate(query, 'r', status)
    appendIndexedReportOutcome(query, 'r', status)
    query.append(sql` ORDER BY r.id DESC LIMIT ${sampleLimit})`)
  }
}

/** One latest report per target branch, with a null guard before its ordered lookup. */
export function appendPageReportHeadBranches(
  query: SQLStatement,
  status: ModerationReportStatus,
): void {
  query.append(sql`SELECT head_candidate.id FROM (`)
  for (const [index, targetColumn] of TARGET_COLUMNS.entries()) {
    if (index > 0) query.append(sql` UNION ALL `)
    query.append(sql`(SELECT mr.id FROM moderation_reports mr WHERE `)
    query.append(`g.${targetColumn} IS NOT NULL AND mr.${targetColumn} = g.${targetColumn} AND `)
    appendModerationReportStatusPredicate(query, 'mr', status)
    appendIndexedReportOutcome(query, 'mr', status)
    query.append(sql` ORDER BY mr.id DESC LIMIT 1)`)
  }
  query.append(sql`) head_candidate ORDER BY head_candidate.id DESC LIMIT 1`)
}

function appendIndexedReportOutcome(
  query: SQLStatement,
  alias: 'r' | 'mr',
  status: ModerationReportStatus,
): void {
  query.append(` AND ${alias}.resolution_action `)
  query.append(
    status === 'pending' ? sql`IS NULL` : sql`= ${status}::moderation_report_resolution_actions`,
  )
}

export function appendSelectedReportBranches(
  query: SQLStatement,
  clusters: ClusterRow[],
  status: ModerationReportStatus,
  sortAsc: boolean,
): void {
  for (const [index, cluster] of clusters.entries()) {
    if (index > 0) query.append(sql` UNION ALL `)
    const column =
      cluster.entity_type === 'post' || cluster.entity_type === 'comment'
        ? 'post_id'
        : cluster.entity_type === 'user'
          ? 'reported_user_id'
          : cluster.entity_type === 'url_hostname'
            ? 'hostname_id'
            : 'rss_feed_item_id'
    query.append(sql`(SELECT mr.id FROM moderation_reports mr WHERE `)
    query.append(`mr.${column} = `).append(sql`${cluster.entity_id}::uuid AND `)
    appendModerationReportStatusPredicate(query, 'mr', status)
    query.append(
      status === 'pending'
        ? sql` AND mr.resolution_action IS NULL`
        : sql` AND mr.resolution_action = ${status}::moderation_report_resolution_actions`,
    )
    query.append(sortAsc ? sql` ORDER BY mr.id ASC` : sql` ORDER BY mr.id DESC`)
    query.append(sql` LIMIT ${25})`)
  }
}
