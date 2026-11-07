import type { AdminModerationReport, AdminModerationReportCluster } from './reports-client-types'
import { isOrdinaryPendingReport } from './report-action-eligibility'

export function selectOrdinaryPendingReports(
  cluster: AdminModerationReportCluster,
): AdminModerationReport[] {
  return cluster.reports.filter(isOrdinaryPendingReport)
}

export function ordinaryResolutionRemovesWholeCluster(
  cluster: AdminModerationReportCluster,
  results: PromiseSettledResult<unknown>[],
): boolean {
  const ordinaryReports = selectOrdinaryPendingReports(cluster)
  return (
    ordinaryReports.length === cluster.report_count &&
    results.length === ordinaryReports.length &&
    results.every(result => result.status === 'fulfilled')
  )
}

export function formatSettledFailure(
  message: string,
  results: PromiseSettledResult<unknown>[],
): Error {
  const failures = results.filter(result => result.status === 'rejected')
  const firstReason = failures[0]?.reason
  const detail = firstReason instanceof Error ? firstReason.message : String(firstReason)
  return new Error(
    `${message}: ${failures.length} failed${detail ? `; first error: ${detail}` : ''}`,
  )
}
