import type { ModerationReportEntityCluster } from './clustered-types.mts'

export function withoutCursorMetadata<T extends object>(
  report: T,
): Omit<T, Extract<keyof T, `cursor_${string}`>> {
  return Object.fromEntries(
    Object.entries(report).filter(([key]) => !key.startsWith('cursor_')),
  ) as Omit<T, Extract<keyof T, `cursor_${string}`>>
}

export function withoutClusterCursorMetadata(cluster: ModerationReportEntityCluster) {
  return { ...cluster, reports: cluster.reports.map(withoutCursorMetadata) }
}
