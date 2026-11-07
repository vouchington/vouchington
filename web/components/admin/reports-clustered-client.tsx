'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { KeyboardShortcutsDialog } from '@/components/keyboard-shortcuts-dialog'
import { useModerationQueueHotkeys } from '@/components/moderation/use-moderation-queue-hotkeys'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { MODERATION_QUEUE_SHORTCUTS } from '@/lib/keyboard-shortcuts'
import { useTranslations } from '@/lib/i18n/use-translations'
import { buildReportsPageHref } from './reports-clustered-format'
import { DuplicateClusterList, ReportClusterList } from './reports-clustered-list'
import { clusterVisibilityKey, filterVisibleDuplicateClusters } from './reports-clustered-state'
import type { AdminClusteredModerationReportsResponse } from './reports-client-types'
import { useClusteredReportActions } from './use-clustered-report-actions'
import { useReportsAiPolling } from './use-reports-ai-polling'

interface ClusteredReportsClientProps {
  data: AdminClusteredModerationReportsResponse
  canBulkRemove: boolean
  statusFilter?: string
  sortOrder?: string
  currentAfter?: string
}

const CLUSTERED_QUEUE_SHORTCUTS = MODERATION_QUEUE_SHORTCUTS.filter(
  shortcut => shortcut.id !== 'moderation-select-active',
)

export function ClusteredReportsClient({
  data,
  canBulkRemove,
  statusFilter,
  sortOrder,
  currentAfter,
}: ClusteredReportsClientProps) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  const [removedClusterKeys, setRemovedClusterKeys] = useState<ReadonlySet<string>>(() => new Set())
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const clusters = useMemo(
    () => data.results.filter(cluster => !removedClusterKeys.has(clusterVisibilityKey(cluster))),
    [data.results, removedClusterKeys],
  )
  const duplicateClusters = useMemo(
    () => filterVisibleDuplicateClusters(data.duplicate_clusters, removedClusterKeys),
    [data.duplicate_clusters, removedClusterKeys],
  )
  const visibleReports = clusters.flatMap(cluster => cluster.reports)
  const { pendingRerunEntities, pollingTimedOut, rerunTimedOut, clearRerunTimeout, markRerun } =
    useReportsAiPolling(visibleReports, true)
  const isPendingFilter = !statusFilter || statusFilter === 'pending'
  const actions = useClusteredReportActions({
    canBulkRemove,
    clearRerunTimeout,
    isPendingFilter,
    markRerun,
    pendingRerunEntities,
    setRemovedClusterKeys,
    visibleReports,
  })
  const disabled =
    Boolean(actions.loadingClusterId || actions.loadingDuplicateId || actions.rerunningReportId) ||
    actions.isRefreshing
  const { activeKey, setActiveKey, helpOpen, setHelpOpen } = useModerationQueueHotkeys({
    disabled,
    items: clusters.map(cluster => ({
      key: cluster.id,
      onDismiss: () => actions.handleResolveCluster(cluster, 'dismissed'),
      onReview: () => actions.handleResolveCluster(cluster, 'reviewed'),
    })),
    onSelectionToggle: () => {},
  })

  return (
    <div
      className='space-y-4'
      data-pw='reports-cluster-list'
    >
      <p className='text-sm text-muted-foreground'>
        {t('shared.countLabel.format', { count: clusters.length, unit: 'queueItem' })}
      </p>
      {(pollingTimedOut || rerunTimedOut) && (
        <output className='block text-sm text-muted-foreground'>
          AI judgement is taking longer than expected. Refresh this page to check again.
        </output>
      )}
      <DuplicateClusterList
        duplicateClusters={duplicateClusters}
        canBulkRemove={canBulkRemove && isPendingFilter}
        disabled={disabled}
        loadingDuplicateId={actions.loadingDuplicateId}
        pendingRerunEntities={pendingRerunEntities}
        onRemove={duplicate => actions.handleRemoveDuplicateCluster(duplicate)}
        uiLocale={uiLocale}
      />
      <ReportClusterList
        clusters={clusters}
        activeKey={activeKey}
        canBulkRemove={canBulkRemove}
        disabled={disabled}
        loadingClusterAction={actions.loadingClusterAction}
        loadingClusterId={actions.loadingClusterId}
        onActiveChange={setActiveKey}
        onDismiss={cluster => actions.handleResolveCluster(cluster, 'dismissed')}
        onRemoveTarget={cluster => actions.handleRemoveClusterTarget(cluster)}
        onReview={cluster => actions.handleResolveCluster(cluster, 'reviewed')}
        onRerun={actions.handleRerun}
        onWarn={actions.handleWarn}
        onBanEvasionAction={actions.handleBanEvasionAction}
        rerunningReportId={actions.rerunningReportId}
        pendingRerunEntities={pendingRerunEntities}
        uiLocale={uiLocale}
      />
      <div className='flex gap-4'>
        {(data.page_info.has_previous_page ?? Boolean(currentAfter)) &&
        data.page_info.start_cursor ? (
          <Link
            href={buildReportsPageHref({
              before: data.page_info.start_cursor,
              status: statusFilter,
              sort: sortOrder,
              cluster: 'entity',
            })}
            className='text-sm underline'
            prefetch={false}
          >
            {t('extracted.admin.adminPagination.previous_a57b08a4')}
          </Link>
        ) : null}
        {data.page_info.has_next_page && data.page_info.end_cursor ? (
          <Link
            href={buildReportsPageHref({
              after: data.page_info.end_cursor,
              status: statusFilter,
              sort: sortOrder,
              cluster: 'entity',
            })}
            className='text-sm underline'
            prefetch={false}
          >
            {t('extracted.admin.reportsClusteredClient.nextPage_c08ac736')}
          </Link>
        ) : null}
      </div>
      <KeyboardShortcutsDialog
        description={t(
          'extracted.admin.reportsClusteredClient.shortcutsForTheActiveModerationReport_5d737d33',
        )}
        open={shortcutsOpen || helpOpen}
        onOpenChange={open => {
          setShortcutsOpen(open)
          setHelpOpen(open)
        }}
        shortcuts={CLUSTERED_QUEUE_SHORTCUTS}
        title={t('extracted.admin.reportsClusteredClient.moderationShortcuts_47c378cf')}
        viewAllLink={false}
      />
    </div>
  )
}
