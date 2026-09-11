/* oxlint-disable max-lines -- clustered moderation queue coordinates several independent action states. */
'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { KeyboardShortcutsDialog } from '@/components/keyboard-shortcuts-dialog'
import { useModerationQueueHotkeys } from '@/components/moderation/use-moderation-queue-hotkeys'
import { deletePost } from '@/lib/api/client/posts'
import { resolveModerationReport, rerunReportJudgement } from '@/lib/api/client/reports'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { MODERATION_QUEUE_SHORTCUTS } from '@/lib/keyboard-shortcuts'
import onError, { onSuccess } from '@/lib/on-error'
import {
  ordinaryResolutionRemovesWholeCluster,
  selectOrdinaryPendingReports,
} from './reports-clustered-actions'
import { buildReportsPageHref } from './reports-clustered-format'
import { DuplicateClusterList, ReportClusterList } from './reports-clustered-list'
import {
  addClusterVisibilityKeys,
  clusterVisibilityKey,
  filterVisibleDuplicateClusters,
} from './reports-clustered-state'
import type {
  AdminClusteredModerationReportsResponse,
  AdminModerationReport,
  AdminModerationReportCluster,
  AdminModerationReportDuplicateCluster,
} from './reports-client-types'
import { useTranslations } from '@/lib/i18n/use-translations'

interface ClusteredReportsClientProps {
  data: AdminClusteredModerationReportsResponse
  canBulkRemove: boolean
  statusFilter?: string
  sortOrder?: string
  currentAfter?: string
}

type ResolveStatus = 'reviewed' | 'dismissed'
type ClusterAction = 'dismiss' | 'remove' | 'review'
const CLUSTERED_QUEUE_SHORTCUTS = MODERATION_QUEUE_SHORTCUTS.filter(
  shortcut => shortcut.id !== 'moderation-select-active',
)

function formatSettledFailure(message: string, results: PromiseSettledResult<unknown>[]): Error {
  const failures = results.filter(result => result.status === 'rejected')
  const firstReason = failures[0]?.reason
  const detail = firstReason instanceof Error ? firstReason.message : String(firstReason)
  return new Error(
    `${message}: ${failures.length} failed${detail ? `; first error: ${detail}` : ''}`,
  )
}

export function ClusteredReportsClient({
  data,
  canBulkRemove,
  statusFilter,
  sortOrder,
  currentAfter,
}: ClusteredReportsClientProps) {
  const t = useTranslations()
  const router = useRouter()
  const uiLocale = useUiLocale()
  const [removedClusterKeys, setRemovedClusterKeys] = useState<ReadonlySet<string>>(() => new Set())
  const [loadingClusterId, setLoadingClusterId] = useState<string | null>(null)
  const [loadingClusterAction, setLoadingClusterAction] = useState<ClusterAction | null>(null)
  const [loadingDuplicateId, setLoadingDuplicateId] = useState<string | null>(null)
  const [rerunningReportId, setRerunningReportId] = useState<string | null>(null)
  const [isRefreshing, startRefreshTransition] = useTransition()
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  const clusters = useMemo(
    () => data.results.filter(cluster => !removedClusterKeys.has(clusterVisibilityKey(cluster))),
    [data.results, removedClusterKeys],
  )
  const duplicateClusters = useMemo(
    () => filterVisibleDuplicateClusters(data.duplicate_clusters, removedClusterKeys),
    [data.duplicate_clusters, removedClusterKeys],
  )
  const disabled =
    Boolean(loadingClusterId || loadingDuplicateId || rerunningReportId) || isRefreshing
  const isPendingFilter = !statusFilter || statusFilter === 'pending'

  const { activeKey, setActiveKey, helpOpen, setHelpOpen } = useModerationQueueHotkeys({
    disabled,
    items: clusters.map(cluster => ({
      key: cluster.id,
      onDismiss: () => handleResolveCluster(cluster, 'dismissed'),
      onReview: () => handleResolveCluster(cluster, 'reviewed'),
    })),
    onSelectionToggle: () => {},
  })

  function handleResolveCluster(cluster: AdminModerationReportCluster, status: ResolveStatus) {
    const pendingReports = selectOrdinaryPendingReports(cluster)
    if (pendingReports.length === 0) return
    setLoadingClusterId(cluster.id)
    setLoadingClusterAction(status === 'reviewed' ? 'review' : 'dismiss')
    startRefreshTransition(async () => {
      try {
        const results = await Promise.allSettled(
          pendingReports.map(report => resolveModerationReport(report.id, status)),
        )
        const failed = results.some(result => result.status === 'rejected')
        if (failed) {
          router.refresh()
          throw formatSettledFailure('Some loaded reports could not be updated', results)
        }
        const resolvedWholeCluster = ordinaryResolutionRemovesWholeCluster(cluster, results)
        if (resolvedWholeCluster) {
          setRemovedClusterKeys(current => new Set(current).add(clusterVisibilityKey(cluster)))
        }
        const statusLabel =
          status === 'reviewed'
            ? t('extracted.admin.reportsClusteredClient.reviewed_e4f934f3')
            : t('extracted.admin.reportsClusteredClient.dismissed_71116847')
        onSuccess(
          `${t('shared.countLabel.format', { count: pendingReports.length, unit: 'loadedReport' })} ${statusLabel}`,
        )
        router.refresh()
      } catch (error) {
        onError(error, {
          fallback: t(
            'extracted.admin.reportsClusteredClient.failedToUpdateReportCluster_aee0929f',
          ),
        })
      } finally {
        setLoadingClusterId(null)
        setLoadingClusterAction(null)
      }
    })
  }

  function handleRemoveClusterTarget(cluster: AdminModerationReportCluster) {
    if (!canBulkRemove || (cluster.entity_type !== 'post' && cluster.entity_type !== 'comment')) {
      return
    }
    setLoadingClusterId(cluster.id)
    setLoadingClusterAction('remove')
    startRefreshTransition(async () => {
      try {
        await deletePost(cluster.entity_id)
        setRemovedClusterKeys(current => new Set(current).add(clusterVisibilityKey(cluster)))
        onSuccess(t('extracted.admin.reportsClusteredClient.targetRemoved_cbaa90e7'))
        router.refresh()
      } catch (error) {
        onError(error, {
          fallback: t('extracted.admin.reportsClusteredClient.failedToRemoveTarget_2a3280c7'),
        })
      } finally {
        setLoadingClusterId(null)
        setLoadingClusterAction(null)
      }
    })
  }

  function handleRemoveDuplicateCluster(duplicate: AdminModerationReportDuplicateCluster) {
    if (!canBulkRemove || !isPendingFilter) return
    const postIds = [...new Set(duplicate.clusters.map(cluster => cluster.entity_id))]
    if (postIds.length === 0) return
    setLoadingDuplicateId(duplicate.id)
    startRefreshTransition(async () => {
      try {
        const results = await Promise.allSettled(postIds.map(postId => deletePost(postId)))
        const failed = results.some(result => result.status === 'rejected')
        if (failed) {
          router.refresh()
          throw formatSettledFailure('Some duplicate posts could not be removed', results)
        }
        setRemovedClusterKeys(current => addClusterVisibilityKeys(current, duplicate.clusters))
        onSuccess(
          `${t('shared.countLabel.format', { count: postIds.length, unit: 'post' })} ${t('extracted.admin.reportsClusteredClient.removed_e1f79758')}`,
        )
        router.refresh()
      } catch (error) {
        onError(error, {
          fallback: t(
            'extracted.admin.reportsClusteredClient.failedToRemoveDuplicateCluster_7e623a38',
          ),
        })
      } finally {
        setLoadingDuplicateId(null)
      }
    })
  }

  function handleRerun(report: AdminModerationReport) {
    setRerunningReportId(report.id)
    startRefreshTransition(async () => {
      try {
        await rerunReportJudgement(report.id)
        onSuccess(t('extracted.admin.reportsClusteredClient.judgementReRunQueued_ac6c0160'))
        router.refresh()
      } catch (error) {
        onError(error, {
          fallback: t('extracted.admin.reportsClusteredClient.failedToReRunJudgement_5650de2a'),
        })
      } finally {
        setRerunningReportId(null)
      }
    })
  }

  function handleWarn() {
    router.refresh()
  }

  function handleBanEvasionAction() {
    startRefreshTransition(() => {
      router.refresh()
    })
  }

  return (
    <div
      className='space-y-4'
      data-pw='reports-cluster-list'
    >
      <p className='text-sm text-muted-foreground'>
        {t('shared.countLabel.format', { count: clusters.length, unit: 'queueItem' })}
      </p>
      <DuplicateClusterList
        duplicateClusters={duplicateClusters}
        canBulkRemove={canBulkRemove && isPendingFilter}
        disabled={disabled}
        loadingDuplicateId={loadingDuplicateId}
        onRemove={duplicate => handleRemoveDuplicateCluster(duplicate)}
        uiLocale={uiLocale}
      />
      <ReportClusterList
        clusters={clusters}
        activeKey={activeKey}
        canBulkRemove={canBulkRemove}
        disabled={disabled}
        loadingClusterAction={loadingClusterAction}
        loadingClusterId={loadingClusterId}
        onActiveChange={setActiveKey}
        onDismiss={cluster => handleResolveCluster(cluster, 'dismissed')}
        onRemoveTarget={cluster => handleRemoveClusterTarget(cluster)}
        onReview={cluster => handleResolveCluster(cluster, 'reviewed')}
        onRerun={handleRerun}
        onWarn={handleWarn}
        onBanEvasionAction={handleBanEvasionAction}
        rerunningReportId={rerunningReportId}
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
