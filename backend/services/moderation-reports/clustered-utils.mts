import {
  MODERATION_REPORT_REASONS,
  type ModerationReportEntityType,
  type ModerationReportReason,
  type ModerationReportStatus,
} from './config.mts'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { ModerationReportSort } from './sort-sql.mts'
import type { PendingModerationReport } from './get.mts'
import type { ModerationReportTargetContent } from './target-metadata.mts'
import type {
  ClusterRow,
  ModerationReportClusterIndicators,
  ModerationReportDuplicateCluster,
  ModerationReportEntityCluster,
  ModerationReportReasonBreakdown,
} from './clustered-types.mts'

export function appendUuidList(query: SQLStatement, ids: string[]) {
  ids.forEach((id, index) => {
    if (index > 0) query.append(sql`, `)
    query.append(sql`${id}::uuid`)
  })
}

export function appendCandidateCursorClause(
  query: SQLStatement,
  beforeCursor: { createdAt: string; entityType?: string; id: string },
  sortAsc: boolean,
  direction: 'after' | 'before' = 'after',
) {
  const forward = direction === 'after'
  if (beforeCursor.entityType) {
    query.append(
      sortAsc === forward
        ? sql` AND (c.sort_reported_at, c.entity_id, c.entity_type) > (${beforeCursor.createdAt}::timestamptz, ${beforeCursor.id}::uuid, ${beforeCursor.entityType})`
        : sql` AND (c.sort_reported_at, c.entity_id, c.entity_type) < (${beforeCursor.createdAt}::timestamptz, ${beforeCursor.id}::uuid, ${beforeCursor.entityType})`,
    )
    return
  }
  query.append(
    sortAsc === forward
      ? sql` AND (c.sort_reported_at, c.entity_id) > (${beforeCursor.createdAt}::timestamptz, ${beforeCursor.id}::uuid)`
      : sql` AND (c.sort_reported_at, c.entity_id) < (${beforeCursor.createdAt}::timestamptz, ${beforeCursor.id}::uuid)`,
  )
}

export function appendClusterWhereClause(query: SQLStatement, clusters: ClusterRow[]) {
  clusters.forEach((cluster, index) => {
    if (index > 0) query.append(sql` OR `)
    query.append(
      sql`(r.entity_type = ${cluster.entity_type} AND r.entity_id = ${cluster.entity_id})`,
    )
  })
}

export function groupReportsByCluster(reports: PendingModerationReport[]) {
  const reportsByCluster = new Map<string, PendingModerationReport[]>()
  for (const report of reports) {
    const id = clusterId(report.entity_type, report.entity_id)
    const list = reportsByCluster.get(id) ?? []
    list.push(report)
    reportsByCluster.set(id, list)
  }
  return reportsByCluster
}

export function parseReasonBreakdown(
  reasonCounts: Record<string, number> | null,
): ModerationReportReasonBreakdown {
  return MODERATION_REPORT_REASONS.flatMap(reason => {
    const count = Number(reasonCounts?.[reason] ?? 0)
    return count > 0 ? [{ reason, count }] : []
  })
}

export function makeDuplicateCluster(
  id: string,
  signal: ModerationReportDuplicateCluster['signal'],
  clusters: ModerationReportEntityCluster[],
): ModerationReportDuplicateCluster {
  return {
    id,
    signal,
    post_count: clusters.length,
    report_count: clusters.reduce((sum, cluster) => sum + cluster.report_count, 0),
    reason_breakdown: mergeReasonBreakdowns(clusters),
    first_reported_at: new Date(
      Math.min(...clusters.map(cluster => cluster.first_reported_at.getTime())),
    ),
    last_reported_at: new Date(
      Math.max(...clusters.map(cluster => cluster.last_reported_at.getTime())),
    ),
    clusters,
  }
}

export function emptyIndicators(): ModerationReportClusterIndicators {
  return {
    content_hash_duplicate: false,
    embeddings_similarity: false,
    velocity_spike: false,
  }
}

export function applyDeletedClusterLabel(row: ClusterRow): {
  target_label: string | null
  target_content: ModerationReportTargetContent | null
  target_path: string | null
  admin_action_path: string | null
} {
  if (row.target_available !== false) {
    return {
      target_label: row.target_label,
      target_content: row.target_content,
      target_path: row.target_path,
      admin_action_path: row.admin_action_path,
    }
  }
  return {
    target_label: '[deleted content]',
    target_content: null,
    target_path: null,
    admin_action_path: null,
  }
}

export function clusterId(entityType: ModerationReportEntityType, entityId: string): string {
  return `${entityType}:${entityId}`
}

export function encodeClusterCursor(
  row: ClusterRow,
  sort: ModerationReportSort,
  status: ModerationReportStatus,
  scope: string,
): string {
  return Buffer.from(
    JSON.stringify({
      cluster: true,
      created_at: row.cursor_created_at,
      entity_type: row.entity_type,
      id: row.entity_id,
      sort,
      status,
      scope,
    }),
  ).toString('base64url')
}

function mergeReasonBreakdowns(
  clusters: ModerationReportEntityCluster[],
): ModerationReportReasonBreakdown {
  const counts = new Map<ModerationReportReason, number>()
  for (const cluster of clusters) {
    for (const item of cluster.reason_breakdown) {
      counts.set(item.reason, (counts.get(item.reason) ?? 0) + item.count)
    }
  }
  return MODERATION_REPORT_REASONS.flatMap(reason => {
    const count = counts.get(reason) ?? 0
    return count > 0 ? [{ reason, count }] : []
  })
}
