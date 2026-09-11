import type { ModerationBulkAction } from '@/components/moderation/bulk-action-toolbar'
import type { ModerationBulkOperation } from '@/components/moderation/bulk-operations'
import type { AdminModerationReport } from './reports-client-types'
import { isOrdinaryPendingReport } from './report-action-eligibility'

interface BuildReportBulkOperationsOptions {
  action: ModerationBulkAction
  canBulkRemove: boolean
  selectedIds: ReadonlySet<string>
  reports: AdminModerationReport[]
  deleteEntityOnce: (entityId: string) => Promise<void>
  resolveReport: (reportId: string, status: 'dismissed') => Promise<unknown>
  onResolved: (reportId: string) => void
}

export function buildReportBulkOperations({
  action,
  canBulkRemove,
  selectedIds,
  reports,
  deleteEntityOnce,
  resolveReport,
  onResolved,
}: BuildReportBulkOperationsOptions): {
  operations: ModerationBulkOperation<string>[]
  skippedIds: Set<string>
} {
  const operations: ModerationBulkOperation<string>[] = []
  const skippedIds = new Set<string>()

  for (const report of reports.filter(item => selectedIds.has(item.id))) {
    const operation = buildReportBulkOperation({
      action,
      canBulkRemove,
      deleteEntityOnce,
      onResolved,
      report,
      resolveReport,
    })
    if (operation) operations.push(operation)
    else skippedIds.add(report.id)
  }

  return { operations, skippedIds }
}

function buildReportBulkOperation({
  action,
  canBulkRemove,
  deleteEntityOnce,
  onResolved,
  report,
  resolveReport,
}: Omit<BuildReportBulkOperationsOptions, 'reports' | 'selectedIds'> & {
  report: AdminModerationReport
}): ModerationBulkOperation<string> | null {
  if (action === 'dismiss') {
    if (!isOrdinaryPendingReport(report)) return null
    return {
      id: report.id,
      run: async () => {
        await resolveReport(report.id, 'dismissed')
        onResolved(report.id)
      },
    }
  }

  if ((report.entity_type !== 'post' && report.entity_type !== 'comment') || !canBulkRemove) {
    return null
  }
  if (!isOrdinaryPendingReport(report)) return null

  return {
    id: report.id,
    run: async () => {
      await deleteEntityOnce(report.entity_id)
      onResolved(report.id)
    },
  }
}

export function countReporters(reports: AdminModerationReport[]): number {
  const ids = new Set<string>()
  for (const report of reports) {
    if (report.reporter_user_id) ids.add(report.reporter_user_id)
  }
  return ids.size
}
