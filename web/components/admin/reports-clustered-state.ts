import {
  DUPLICATE_CLUSTER_THRESHOLD,
  MODERATION_REPORT_REASONS,
} from '@ts-shared/utils/moderation-reports'
import type {
  AdminModerationReportCluster,
  AdminModerationReportDuplicateCluster,
  ModerationReportReasonBreakdown,
} from './reports-client-types'

export function filterVisibleDuplicateClusters(
  duplicateClusters: AdminModerationReportDuplicateCluster[],
  removedClusterKeys: ReadonlySet<string>,
) {
  return duplicateClusters.flatMap(duplicate => {
    const clusters = duplicate.clusters.filter(
      cluster => !removedClusterKeys.has(clusterVisibilityKey(cluster)),
    )
    if (clusters.length < DUPLICATE_CLUSTER_THRESHOLD) return []
    return [
      {
        ...duplicate,
        clusters,
        post_count: clusters.length,
        reason_breakdown: mergeReasonBreakdowns(clusters),
        report_count: clusters.reduce((sum, cluster) => sum + cluster.report_count, 0),
      },
    ]
  })
}

export function addClusterVisibilityKeys(
  current: ReadonlySet<string>,
  clusters: AdminModerationReportCluster[],
): ReadonlySet<string> {
  const next = new Set(current)
  for (const cluster of clusters) next.add(clusterVisibilityKey(cluster))
  return next
}

export function clusterVisibilityKey(cluster: AdminModerationReportCluster): string {
  return `${cluster.id}:${cluster.report_count}:${cluster.last_reported_at}`
}

function mergeReasonBreakdowns(
  clusters: AdminModerationReportCluster[],
): ModerationReportReasonBreakdown {
  const counts = new Map<ModerationReportReasonBreakdown[number]['reason'], number>()
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
