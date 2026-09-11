'use client'

import Link from 'next/link'
import { ChevronDown, ExternalLink } from 'lucide-react'
import { TimeAgo } from '@/components/shared/time-ago'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { useTranslations } from '@/lib/i18n/use-translations'
import { ReportClusterActions } from './report-cluster-actions'
import { ReportDetail } from './report-cluster-detail'
import { IndicatorBadges } from './report-cluster-indicators'
import { formatReasonBreakdown } from './reports-clustered-format'
import { ReportTargetContent } from '@/components/moderation/report-target-content'
import { selectOrdinaryPendingReports } from './reports-clustered-actions'
import type { AdminModerationReport, AdminModerationReportCluster } from './reports-client-types'

export function ReportClusterCard({
  active,
  cluster,
  canRemove,
  disabled,
  loadingAction,
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
  uiLocale: string
}) {
  const t = useTranslations()
  const targetLabel = cluster.target_label ?? cluster.entity_id
  const hasPendingReports = selectOrdinaryPendingReports(cluster).length > 0
  const isPartialReportSet = cluster.reports.length < cluster.report_count
  const canRemoveTarget =
    canRemove && (cluster.entity_type === 'post' || cluster.entity_type === 'comment')
  const adminHref = cluster.admin_action_path ?? cluster.target_path
  const showTargetLink =
    cluster.target_path !== null &&
    cluster.admin_action_path !== null &&
    cluster.target_path !== cluster.admin_action_path
  const targetHref = showTargetLink ? cluster.target_path : null

  return (
    <Collapsible defaultOpen={cluster.report_count > 1}>
      <div
        data-pw='report-cluster-row'
        data-active={active}
        className={cn(
          'rounded-md border bg-card outline-none transition-colors',
          active && 'ring-2 ring-inset ring-ring',
        )}
      >
        <div className='flex flex-wrap items-start justify-between gap-3 p-4'>
          <CollapsibleTrigger asChild>
            <Button
              type='button'
              variant='ghost'
              data-moderation-queue-key={cluster.id}
              className='h-auto min-h-11 flex-1 items-start justify-start gap-3 p-0 text-left hover:bg-transparent'
              onFocus={() => onActiveChange(cluster.id)}
            >
              <ChevronDown className='mt-1 size-4 shrink-0 text-muted-foreground' />
              <span className='space-y-2'>
                <span className='flex flex-wrap items-center gap-2'>
                  <Badge
                    variant='outline'
                    asChild
                  >
                    <span>{cluster.entity_type}</span>
                  </Badge>
                  <span className='font-medium'>
                    <ReportTargetContent
                      fallback={targetLabel}
                      targetContent={cluster.target_content}
                    />
                  </span>
                </span>
                <span className='flex flex-wrap items-center gap-2 text-sm text-muted-foreground'>
                  <span>
                    {t('shared.countLabel.format', { count: cluster.report_count, unit: 'report' })}
                  </span>
                  <span>
                    {t('shared.countLabel.format', {
                      count: cluster.reporter_count,
                      unit: 'reporter',
                    })}
                  </span>
                  <span>
                    {t('extracted.admin.reportClusterCard.lastReport_d676b8c1')}{' '}
                    <TimeAgo date={cluster.last_reported_at} />
                  </span>
                </span>
                <span className='flex flex-wrap items-center gap-2'>
                  <span className='text-sm text-muted-foreground'>
                    {formatReasonBreakdown(cluster.reason_breakdown, uiLocale)}
                  </span>
                  <IndicatorBadges cluster={cluster} />
                </span>
              </span>
            </Button>
          </CollapsibleTrigger>
          {adminHref ? (
            <Link
              href={adminHref}
              className='inline-flex min-h-11 items-center gap-1 text-xs underline'
              prefetch={false}
            >
              {t('extracted.admin.reportClusterCard.openAdmin_d2e9fce8')}
              <ExternalLink className='size-3' />
            </Link>
          ) : null}
          {targetHref ? (
            <Link
              href={targetHref}
              className='inline-flex min-h-11 items-center gap-1 text-xs underline'
              prefetch={false}
            >
              {t('extracted.admin.reportClusterCard.openTarget_d2e00ca0')}
              <ExternalLink className='size-3' />
            </Link>
          ) : null}
          <ReportClusterActions
            disabled={disabled}
            loadingAction={loadingAction}
            canRemoveTarget={canRemoveTarget}
            hasPendingReports={hasPendingReports}
            isPartialReportSet={isPartialReportSet}
            onDismiss={onDismiss}
            onRemoveTarget={onRemoveTarget}
            onReview={onReview}
          />
        </div>
        <CollapsibleContent>
          <div className='border-t px-4 py-3'>
            <div className='grid gap-3'>
              {cluster.reports.map(report => (
                <ReportDetail
                  key={report.id}
                  report={report}
                  disabled={disabled}
                  rerunning={rerunningReportId === report.id}
                  onRerun={() => onRerun(report)}
                  onWarn={() => onWarn(report)}
                  onBanEvasionAction={onBanEvasionAction}
                />
              ))}
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
