import type { AdminModerationReport } from './reports-client-types'

export function isOrdinaryPendingReport(report: AdminModerationReport): boolean {
  return report.status === 'pending' && !report.is_system_generated && !report.community_ban_evasion
}

export function isReportRerunPending(
  reportId: string,
  reports: AdminModerationReport[],
  pendingEntities: ReadonlySet<string>,
): boolean {
  const report = reports.find(candidate => candidate.id === reportId)
  return Boolean(report && pendingEntities.has(`${report.entity_type}:${report.entity_id}`))
}
