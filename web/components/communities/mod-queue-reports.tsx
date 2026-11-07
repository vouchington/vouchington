'use client'

import type { CommunityModerationReport } from '@/types/api-responses'
import { ModQueueReportCard } from './mod-queue-report-card'
import { useModQueueReportActions } from './use-mod-queue-report-actions'

interface ModQueueReportsProps {
  activeKey?: string | null
  bulkDisabled?: boolean
  communitySlug: string
  currentUserId?: string | null
  isStaff?: boolean
  loading: string | null
  onActiveChange?: (key: string) => void
  onResolve: (report: CommunityModerationReport, status: 'reviewed' | 'dismissed') => void
  /** Called after a warn succeeds so the caller can remove the now-actioned report. */
  onWarn?: (reportId: string) => void
  /** Called after a ban-evasion confirm/dismiss so the caller can remove the actioned report. */
  onBanEvasionAction?: (reportId: string) => void
  onSelectionToggle: (reportId: string) => void
  onClaimToggle?: (reportId: string) => void
  onEscalateToggle?: (reportId: string, escalated: boolean) => void
  reports: CommunityModerationReport[]
  selectedIds: ReadonlySet<string>
}

const noop = () => {}

export function ModQueueReports({
  activeKey = null,
  bulkDisabled = false,
  communitySlug,
  currentUserId = null,
  isStaff = false,
  loading,
  onActiveChange = noop,
  onResolve,
  onWarn,
  onBanEvasionAction,
  onSelectionToggle,
  onClaimToggle,
  onEscalateToggle,
  reports,
  selectedIds,
}: ModQueueReportsProps) {
  const reportActions = useModQueueReportActions({
    communitySlug,
    onClaimToggle,
    onEscalateToggle,
  })

  return (
    <div className='space-y-3'>
      {reports.map(report => (
        <ModQueueReportCard
          key={report.id}
          activeKey={activeKey}
          bulkDisabled={bulkDisabled}
          communitySlug={communitySlug}
          currentUserId={currentUserId}
          isStaff={isStaff}
          loading={loading}
          onActiveChange={onActiveChange}
          onBanEvasionAction={onBanEvasionAction}
          onResolve={onResolve}
          onSelectionToggle={onSelectionToggle}
          onWarn={onWarn}
          report={report}
          reportActions={reportActions}
          selected={selectedIds.has(report.id)}
        />
      ))}
    </div>
  )
}
