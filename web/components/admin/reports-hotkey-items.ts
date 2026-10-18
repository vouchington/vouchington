import type { AdminModerationReport } from './reports-client-types'
import { isOrdinaryPendingReport } from './report-action-eligibility'

type ResolveStatus = 'reviewed' | 'dismissed'

export function buildReportHotkeyItems(
  reports: AdminModerationReport[],
  pendingRerunEntities: ReadonlySet<string>,
  resolve: (reportId: string, status: ResolveStatus) => void,
) {
  return reports.map(report => {
    const enabled =
      isOrdinaryPendingReport(report) &&
      !pendingRerunEntities.has(`${report.entity_type}:${report.entity_id}`)
    return {
      key: report.id,
      onDismiss: enabled ? () => resolve(report.id, 'dismissed') : undefined,
      onReview: enabled ? () => resolve(report.id, 'reviewed') : undefined,
    }
  })
}
