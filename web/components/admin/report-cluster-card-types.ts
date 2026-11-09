import type { AdminModerationReport, AdminModerationReportCluster } from './reports-client-types'

export interface ReportClusterCardProps {
  active: boolean
  cluster: AdminModerationReportCluster
  canRemove: boolean
  disabled: boolean
  loadingAction: 'dismiss' | 'remove' | 'review' | null
  onActiveChange: (clusterId: string) => void
  onDismiss: () => void
  onRemoveTarget: () => void
  onReview: () => void
  onRerun: (report: AdminModerationReport) => void
  onWarn: (report: AdminModerationReport) => void
  onBanEvasionAction: (reportId: string) => void
  rerunningReportId: string | null
  pendingRerunEntities?: ReadonlySet<string>
  uiLocale: string
}
