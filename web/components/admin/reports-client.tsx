'use client'
/* oxlint-disable max-lines -- reports dashboard owns table rendering plus mutation state */

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AdminTableShell } from '@/components/admin/admin-table-shell'
import { KeyboardShortcutsDialog } from '@/components/keyboard-shortcuts-dialog'
import {
  BulkActionToolbar,
  type ModerationBulkAction,
} from '@/components/moderation/bulk-action-toolbar'
import {
  formatModerationBulkMessage,
  runModerationBulkOperations,
} from '@/components/moderation/bulk-operations'
import { useModerationQueueHotkeys } from '@/components/moderation/use-moderation-queue-hotkeys'
import onError, { onSuccess } from '@/lib/on-error'
import { deletePost } from '@/lib/api/client/posts'
import {
  resolveModerationReport,
  rerunReportJudgement,
  type MemberModerationReport,
  type ModerationReportSortParam,
} from '@/lib/api/client/reports'
import { MODERATION_QUEUE_SHORTCUTS } from '@/lib/keyboard-shortcuts'
import { AdminReportRow } from './admin-report-row'
import { MemberReportRow } from './member-report-row'
import { ClusteredReportsClient } from './reports-clustered-client'
import { buildReportBulkOperations, countReporters } from './reports-bulk-operations'
import { isOrdinaryPendingReport } from './report-action-eligibility'
import { ReportsPagination, ReportsSortSelect } from './reports-navigation'
import { ReportsTableHeader } from './reports-table-header'
import { useReportsAiPolling } from './use-reports-ai-polling'

export type {
  AdminModerationReport,
  AdminClusteredModerationReportsResponse,
  AdminModerationReportsResponse,
} from './reports-client-types'
import type {
  AdminClusteredModerationReportsResponse,
  AdminModerationReport,
  AdminModerationReportsResponse,
  MemberModerationReportsResponse,
} from './reports-client-types'
import { useTranslations } from '@/lib/i18n/use-translations'

type ReportsClientProps = (
  | {
      viewerTier: 'staff'
      data: AdminModerationReportsResponse | AdminClusteredModerationReportsResponse
      canBulkRemove?: boolean
    }
  | { viewerTier: 'member'; data: MemberModerationReportsResponse }
) & {
  /** Active URL state, forwarded to pagination links so navigation preserves it. */
  statusFilter?: string
  sortOrder?: ModerationReportSortParam
  currentAfter?: string
  clusterMode?: 'entity' | 'none'
}

type ResolveStatus = 'reviewed' | 'dismissed'

export function ReportsClient(props: ReportsClientProps) {
  const { viewerTier, data, statusFilter, sortOrder, currentAfter, clusterMode } = props
  if (viewerTier === 'staff') {
    const canBulkRemove = props.canBulkRemove ?? true
    if (isClusteredReportsResponse(data)) {
      return (
        <ClusteredReportsClient
          data={data}
          canBulkRemove={canBulkRemove}
          statusFilter={statusFilter}
          sortOrder={sortOrder}
          currentAfter={currentAfter}
        />
      )
    }
    return (
      <FlatReportsClient
        viewerTier='staff'
        data={data}
        canBulkRemove={canBulkRemove}
        statusFilter={statusFilter}
        sortOrder={sortOrder}
        currentAfter={currentAfter}
        clusterMode={clusterMode}
      />
    )
  }
  return (
    <FlatReportsClient
      viewerTier='member'
      data={data}
      canBulkRemove={false}
      statusFilter={statusFilter}
      sortOrder={sortOrder}
      currentAfter={currentAfter}
      clusterMode={clusterMode}
    />
  )
}

type FlatReportsClientProps = (
  | { viewerTier: 'staff'; data: AdminModerationReportsResponse }
  | { viewerTier: 'member'; data: MemberModerationReportsResponse }
) & {
  canBulkRemove: boolean
  statusFilter?: string
  sortOrder?: ModerationReportSortParam
  currentAfter?: string
  clusterMode?: 'entity' | 'none'
}

function FlatReportsClient(props: FlatReportsClientProps) {
  const t = useTranslations()
  const { viewerTier, data, statusFilter, sortOrder, canBulkRemove, currentAfter, clusterMode } =
    props
  const router = useRouter()
  const [resolvedIds, setResolvedIds] = useState<ReadonlySet<string>>(() => new Set())
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [rerunningId, setRerunningId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set())
  const [bulkAction, setBulkAction] = useState<ModerationBulkAction | null>(null)
  const [bulkMessage, setBulkMessage] = useState<string | null>(null)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [isRefreshing, startRefreshTransition] = useTransition()
  const reports = useMemo(
    () => data.results.filter(report => !resolvedIds.has(report.id)),
    [data.results, resolvedIds],
  )
  const isEmpty = reports.length === 0
  const { pendingRerunEntities, pollingTimedOut, rerunTimedOut, clearRerunTimeout, markRerun } =
    useReportsAiPolling(
      viewerTier === 'staff' ? (reports as AdminModerationReport[]) : [],
      viewerTier === 'staff',
    )
  const hotkeyItems =
    viewerTier === 'staff'
      ? (reports as AdminModerationReport[]).map(report => {
          const rerunPending = pendingRerunEntities.has(`${report.entity_type}:${report.entity_id}`)
          return {
            key: report.id,
            // Ban-evasion reports must be resolved via the dedicated confirm/dismiss
            // actions so that community_members.suspected_ban_evader_* is cleared.
            onDismiss:
              !isOrdinaryPendingReport(report) || rerunPending
                ? undefined
                : () => handleResolve(report.id, 'dismissed'),
            onReview:
              !isOrdinaryPendingReport(report) || rerunPending
                ? undefined
                : () => handleResolve(report.id, 'reviewed'),
          }
        })
      : []
  const {
    activeKey,
    helpOpen: shortcutsOpen,
    setActiveKey,
    setHelpOpen: setShortcutsOpen,
  } = useModerationQueueHotkeys({
    disabled: bulkLoading || loadingId !== null || rerunningId !== null || isRefreshing,
    items: hotkeyItems,
    onSelectionToggle: toggleSelected,
  })

  const reporterCount = useMemo(() => {
    if (viewerTier !== 'staff') return null
    return countReporters(reports as AdminModerationReport[])
  }, [reports, viewerTier])

  async function handleResolve(reportId: string, status: ResolveStatus) {
    if (isReportRerunPending(reportId)) return
    // Disable all rows while one resolve is in flight (prevents concurrent double-submits).
    setLoadingId(reportId)
    try {
      await resolveModerationReport(reportId, status)
      // The resolved row unmounts (filtered out); clearing loadingId re-enables the
      // remaining rows. The submitted row never re-enables because it is removed.
      setResolvedIds(current => new Set(current).add(reportId))
      clearSelected(reportId)
    } catch (err) {
      onError(err, {
        fallback: t('extracted.admin.reportsClient.failedToUpdateReport_61bf19b3'),
        tags: { form: 'moderation-resolve' },
      })
    } finally {
      setLoadingId(null)
    }
  }

  function handleWarn(reportId: string) {
    if (isReportRerunPending(reportId)) return
    // The backend already resolved the report as 'actioned'; just remove it from the list.
    setResolvedIds(current => new Set(current).add(reportId))
  }

  function handleBanEvasionAction(reportId: string) {
    if (isReportRerunPending(reportId)) return
    setResolvedIds(current => new Set(current).add(reportId))
  }

  function isReportRerunPending(reportId: string): boolean {
    const target = (reports as AdminModerationReport[]).find(report => report.id === reportId)
    return Boolean(target && pendingRerunEntities.has(`${target.entity_type}:${target.entity_id}`))
  }

  function handleRerun(reportId: string) {
    if (isReportRerunPending(reportId)) return
    clearRerunTimeout()
    setRerunningId(reportId)
    // Wrap the entire async sequence so controls stay disabled until both the POST
    // and the follow-up router.refresh() transition complete (web/AGENTS.md rule 29).
    startRefreshTransition(async () => {
      try {
        const before = (reports as AdminModerationReport[]).find(report => report.id === reportId)
        await rerunReportJudgement(reportId)
        markRerun(reportId, before?.judgement?.id ?? null)
        onSuccess(t('extracted.admin.reportsClient.judgementReRunQueued_ac6c0160'))
        // Note: because the rerun is async (202), the new judgement may not be
        // immediately visible until the background worker completes.
        router.refresh()
      } catch (err) {
        onError(err, {
          fallback: t('extracted.admin.reportsClient.failedToReRunJudgement_5650de2a'),
          tags: { form: 'moderation-rerun' },
        })
      } finally {
        setRerunningId(null)
      }
    })
  }

  function toggleSelected(reportId: string) {
    if (viewerTier !== 'staff' || bulkLoading) return
    setBulkMessage(null)
    setSelectedIds(current => {
      if (isReportRerunPending(reportId) && !current.has(reportId)) return current
      const next = new Set(current)
      if (next.has(reportId)) next.delete(reportId)
      else next.add(reportId)
      return next
    })
  }

  function clearSelected(reportId: string) {
    setSelectedIds(current => {
      if (!current.has(reportId)) return current
      const next = new Set(current)
      next.delete(reportId)
      return next
    })
  }

  async function handleBulkConfirm(action: ModerationBulkAction) {
    if (viewerTier !== 'staff') return

    const staffReports = reports as AdminModerationReport[]
    const rerunSkippedIds = new Set<string>()
    for (const report of staffReports) {
      if (selectedIds.has(report.id) && isReportRerunPending(report.id)) {
        rerunSkippedIds.add(report.id)
      }
    }
    const actionableSelectedIds = new Set(
      [...selectedIds].filter(reportId => !rerunSkippedIds.has(reportId)),
    )

    const deletePromises = new Map<string, Promise<void>>()
    const deleteEntityOnce = (entityId: string) => {
      const existing = deletePromises.get(entityId)
      if (existing) return existing
      const promise = deletePost(entityId)
      deletePromises.set(entityId, promise)
      return promise
    }
    const { operations, skippedIds } = buildReportBulkOperations({
      action,
      canBulkRemove,
      deleteEntityOnce,
      onResolved: reportId => setResolvedIds(current => new Set(current).add(reportId)),
      reports: staffReports,
      resolveReport: resolveModerationReport,
      selectedIds: actionableSelectedIds,
    })
    for (const reportId of rerunSkippedIds) skippedIds.add(reportId)

    setBulkLoading(true)
    try {
      const failedIds = await runModerationBulkOperations(operations)
      const remaining = new Set<string>([...failedIds, ...skippedIds])
      const succeeded = operations.length - failedIds.size
      setSelectedIds(remaining)
      setBulkAction(null)
      setBulkMessage(
        formatModerationBulkMessage({
          succeeded,
          failed: failedIds.size,
          skipped: skippedIds.size,
        }),
      )
      if (succeeded > 0) router.refresh()
    } finally {
      setBulkLoading(false)
    }
  }

  return (
    <div
      className='space-y-4'
      data-pw='reports-list'
    >
      <p className='text-sm text-muted-foreground'>
        {reports.length} report{reports.length === 1 ? '' : 's'}
        {viewerTier === 'staff' && reporterCount !== null && reporterCount > 0
          ? ` from ${reporterCount} reporter${reporterCount === 1 ? '' : 's'}`
          : null}
      </p>
      {(pollingTimedOut || rerunTimedOut) && (
        <output className='block text-sm text-muted-foreground'>
          AI judgement is taking longer than expected. Refresh this page to check again.
        </output>
      )}
      <div className='flex flex-wrap items-center gap-2'>
        <ReportsSortSelect
          viewerTier={viewerTier}
          sortOrder={sortOrder}
        />
      </div>
      {viewerTier === 'staff' ? (
        <BulkActionToolbar
          action={bulkAction}
          canRemove={canBulkRemove}
          disabled={bulkLoading || loadingId !== null || rerunningId !== null || isRefreshing}
          message={bulkMessage}
          onActionChange={setBulkAction}
          onClearSelection={() => {
            setSelectedIds(new Set())
            setBulkAction(null)
            setBulkMessage(null)
          }}
          onConfirm={handleBulkConfirm}
          removeReason=''
          selectedCount={selectedIds.size}
        />
      ) : null}
      <AdminTableShell
        aria-label={t('extracted.reports.page.moderationReports_7824479e')}
        isEmpty={isEmpty}
        emptyMessage={t('extracted.admin.reportsClient.noPendingReports_36379210')}
      >
        <table className='min-w-full divide-y divide-border'>
          <ReportsTableHeader viewerTier={viewerTier} />
          <tbody className='divide-y divide-border bg-card'>
            {viewerTier === 'staff'
              ? (reports as AdminModerationReport[]).map(report => (
                  <AdminReportRow
                    key={report.id}
                    active={activeKey === report.id}
                    disabled={
                      loadingId !== null ||
                      rerunningId !== null ||
                      isRefreshing ||
                      bulkLoading ||
                      pendingRerunEntities.has(`${report.entity_type}:${report.entity_id}`)
                    }
                    onActiveChange={setActiveKey}
                    onResolve={handleResolve}
                    onRerun={handleRerun}
                    onWarn={handleWarn}
                    onBanEvasionAction={handleBanEvasionAction}
                    onSelectionToggle={toggleSelected}
                    report={report}
                    selected={selectedIds.has(report.id)}
                  />
                ))
              : (reports as MemberModerationReport[]).map(report => (
                  <MemberReportRow
                    key={report.id}
                    report={report}
                  />
                ))}
          </tbody>
        </table>
      </AdminTableShell>
      <ReportsPagination
        pageInfo={data.page_info}
        currentAfter={currentAfter}
        statusFilter={statusFilter}
        sortOrder={sortOrder}
        clusterMode={clusterMode}
      />
      <KeyboardShortcutsDialog
        description={t(
          'extracted.admin.reportsClient.shortcutsForTheActiveModerationReport_e3dca514',
        )}
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
        shortcuts={MODERATION_QUEUE_SHORTCUTS}
        title={t('extracted.admin.reportsClient.moderationShortcuts_47c378cf')}
        viewAllLink={false}
      />
    </div>
  )
}

function isClusteredReportsResponse(
  data: AdminModerationReportsResponse | AdminClusteredModerationReportsResponse,
): data is AdminClusteredModerationReportsResponse {
  return 'cluster_mode' in data
}
