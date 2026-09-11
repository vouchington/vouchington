'use client'

import { useTranslations } from '@/lib/i18n/use-translations'
import { ReportClusterCard } from './report-cluster-card'
import { DuplicateClusterCard } from './report-duplicate-cluster-card'
import type {
  AdminModerationReport,
  AdminModerationReportCluster,
  AdminModerationReportDuplicateCluster,
} from './reports-client-types'

export function DuplicateClusterList({
  duplicateClusters,
  canBulkRemove,
  disabled,
  loadingDuplicateId,
  onRemove,
  uiLocale,
}: {
  duplicateClusters: AdminModerationReportDuplicateCluster[]
  canBulkRemove: boolean
  disabled: boolean
  loadingDuplicateId: string | null
  onRemove: (duplicate: AdminModerationReportDuplicateCluster) => void
  uiLocale: string
}) {
  const t = useTranslations()
  if (duplicateClusters.length === 0) return null
  return (
    <section
      aria-label={t('extracted.admin.reportsClusteredList.duplicateReportClusters_96234e8f')}
      className='space-y-3'
    >
      {duplicateClusters.map(duplicate => (
        <DuplicateClusterCard
          key={duplicate.id}
          duplicate={duplicate}
          canRemove={canBulkRemove}
          disabled={disabled}
          loading={loadingDuplicateId === duplicate.id}
          onRemove={() => onRemove(duplicate)}
          uiLocale={uiLocale}
        />
      ))}
    </section>
  )
}

export function ReportClusterList({
  clusters,
  activeKey,
  canBulkRemove,
  disabled,
  loadingClusterAction,
  loadingClusterId,
  onActiveChange,
  onDismiss,
  onRemoveTarget,
  onReview,
  onRerun,
  onWarn,
  onBanEvasionAction,
  rerunningReportId,
  uiLocale,
}: {
  clusters: AdminModerationReportCluster[]
  activeKey: string | null
  canBulkRemove: boolean
  disabled: boolean
  loadingClusterAction: 'dismiss' | 'remove' | 'review' | null
  loadingClusterId: string | null
  onActiveChange: (clusterId: string) => void
  onDismiss: (cluster: AdminModerationReportCluster) => void
  onRemoveTarget: (cluster: AdminModerationReportCluster) => void
  onReview: (cluster: AdminModerationReportCluster) => void
  onRerun: (report: AdminModerationReport) => void
  onWarn: (report: AdminModerationReport) => void
  onBanEvasionAction: (reportId: string) => void
  rerunningReportId: string | null
  uiLocale: string
}) {
  const t = useTranslations()
  return (
    <section
      aria-label={t('extracted.admin.reportsClusteredList.reportClusters_030ac133')}
      className='space-y-3'
    >
      {clusters.length === 0 ? (
        <div className='rounded-md border bg-card p-6 text-sm text-muted-foreground'>
          {t('extracted.admin.reportsClusteredList.noPendingReports_36379210')}
        </div>
      ) : (
        clusters.map(cluster => (
          <ReportClusterCard
            key={cluster.id}
            active={activeKey === cluster.id}
            cluster={cluster}
            canRemove={canBulkRemove}
            disabled={disabled}
            loadingAction={loadingClusterId === cluster.id ? loadingClusterAction : null}
            onActiveChange={onActiveChange}
            onDismiss={() => onDismiss(cluster)}
            onRemoveTarget={() => onRemoveTarget(cluster)}
            onReview={() => onReview(cluster)}
            onRerun={onRerun}
            onWarn={onWarn}
            onBanEvasionAction={onBanEvasionAction}
            rerunningReportId={rerunningReportId}
            uiLocale={uiLocale}
          />
        ))
      )}
    </section>
  )
}
