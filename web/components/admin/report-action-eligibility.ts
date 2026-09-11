import type { AdminModerationReport } from './reports-client-types'

export function isOrdinaryPendingReport(report: AdminModerationReport): boolean {
  return report.status === 'pending' && !report.is_system_generated && !report.community_ban_evasion
}
