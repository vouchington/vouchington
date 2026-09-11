'use client'

import type { ReportIntegrityFlagsResponse, StatusFilter } from '@/types/report-integrity'
import { useReportIntegrityFlags } from './use-report-integrity-flags'
import { ReportIntegrityFlagsHeader } from './report-integrity-flags-header'
import { ReportIntegrityFlagsTable } from './report-integrity-flags-table'

export function ReportIntegrityFlagsClient({
  initialData,
  initialStatus,
}: {
  initialData: ReportIntegrityFlagsResponse
  initialStatus: StatusFilter
}) {
  return (
    <ReportIntegrityFlagsClientInner
      key={initialStatus}
      initialData={initialData}
      initialStatus={initialStatus}
    />
  )
}

function ReportIntegrityFlagsClientInner({
  initialData,
  initialStatus,
}: {
  initialData: ReportIntegrityFlagsResponse
  initialStatus: StatusFilter
}) {
  const state = useReportIntegrityFlags(initialData, initialStatus)

  return (
    <div>
      <ReportIntegrityFlagsHeader
        isPending={state.isPending}
        onRefresh={state.handleRefreshFlags}
        onStatusChange={state.handleStatusChange}
        selectedStatus={state.selectedStatus}
      />

      <ReportIntegrityFlagsTable
        {...state}
        initialStatus={initialStatus}
      />
    </div>
  )
}
