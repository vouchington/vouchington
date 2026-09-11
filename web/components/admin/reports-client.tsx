'use client'
/* oxlint-disable max-lines -- reports dashboard owns table rendering plus mutation state */

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AdminReportRow } from './admin-report-row'
import { MemberReportRow } from './member-report-row'
import { ClusteredReportsClient } from './reports-clustered-client'
import { buildReportBulkOperations, countReporters } from './reports-bulk-operations'
import { isOrdinaryPendingReport } from './report-action-eligibility'
import { buildReportsPageHref } from './reports-clustered-format'

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
  sortOrder?: string
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
  const hotkeyItems =
    viewerTier === 'staff'
      ? (reports as AdminModerationReport[]).map(report => ({
          key: report.id,
          // Ban-evasion reports must be resolved via the dedicated confirm/dismiss
          // actions so that community_members.suspected_ban_evader_* is cleared.
          onDismiss: !isOrdinaryPendingReport(report)
            ? undefined
            : () => handleResolve(report.id, 'dismissed'),
          onReview: !isOrdinaryPendingReport(report)
            ? undefined
            : () => handleResolve(report.id, 'reviewed'),
        }))
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
    // Disable all rows while one resolve is in flight (prevents concurrent double-submits).
    setLoadingId(reportId)
    try {
      await resolveModerationReport(reportId, status)
      // The resolved row unmounts (filtered out); clearing loadingId re-enables the
      // remaining rows. The submitted row never re-enables because it is removed.
      setResolvedIds(current => new Set(current).add(reportId))
      clearSelected(reportId)
    } catch (error) {
      onError(error, {
        fallback: t('extracted.admin.reportsClient.failedToUpdateReport_61bf19b3'),
        tags: { form: 'moderation-resolve' },
      })
    } finally {
      setLoadingId(null)
    }
  }

  function handleWarn(reportId: string) {
    // The backend already resolved the report as 'actioned'; just remove it from the list.
    setResolvedIds(current => new Set(current).add(reportId))
  }

  function handleBanEvasionAction(reportId: string) {
    setResolvedIds(current => new Set(current).add(reportId))
  }

  function handleRerun(reportId: string) {
    setRerunningId(reportId)
    // Wrap the entire async sequence so controls stay disabled until both the POST
    // and the follow-up router.refresh() transition complete (web/CLAUDE.md rule 29).
    startRefreshTransition(async () => {
      try {
        await rerunReportJudgement(reportId)
        onSuccess(t('extracted.admin.reportsClient.judgementReRunQueued_ac6c0160'))
        // Note: because the rerun is async (202), the new judgement may not be
        // immediately visible until the background worker completes.
        router.refresh()
      } catch (error) {
        onError(error, {
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
      reports: reports as AdminModerationReport[],
      resolveReport: resolveModerationReport,
      selectedIds,
    })

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
      <div className='flex flex-wrap items-center gap-2'>
        <Select
          value={sortOrder ?? (viewerTier === 'staff' ? 'severity' : 'created_at_desc')}
          onValueChange={value => {
            const params = new URL(window.location.href).searchParams
            params.set('sort', value)
            params.delete('after')
            params.delete('before')
            router.push(`/reports?${params.toString()}`, { scroll: false })
          }}
        >
          <SelectTrigger
            aria-label={t('extracted.admin.reportsClient.sortReports_87711bde')}
            className='h-11 w-44 sm:h-9'
            data-pw='reports-sort-trigger'
          >
            <SelectValue placeholder={t('extracted.admin.reportsClient.sortReports_87711bde')} />
          </SelectTrigger>
          <SelectContent>
            {viewerTier === 'staff' ? <StaffSortItems /> : <MemberSortItems />}
          </SelectContent>
        </Select>
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
          <thead className='bg-muted/50'>
            <tr>
              {viewerTier === 'staff' ? (
                <th className='px-6 py-3 text-left text-xs font-medium uppercase text-muted-foreground'>
                  {t('extracted.admin.reportsClient.select_2a78025d')}
                </th>
              ) : null}
              <th className='px-6 py-3 text-left text-xs font-medium uppercase text-muted-foreground'>
                {t('extracted.admin.reportsClient.created_d70b9e24')}
              </th>
              {viewerTier === 'staff' ? (
                <th className='px-6 py-3 text-left text-xs font-medium uppercase text-muted-foreground'>
                  {t('extracted.admin.reportsClient.reporter_ed738fe8')}
                </th>
              ) : null}
              <th className='px-6 py-3 text-left text-xs font-medium uppercase text-muted-foreground'>
                {t('extracted.admin.reportsClient.target_978354db')}
              </th>
              <th className='px-6 py-3 text-left text-xs font-medium uppercase text-muted-foreground'>
                {t('extracted.admin.reportsClient.reason_f81ab834')}
              </th>
              <th className='px-6 py-3 text-left text-xs font-medium uppercase text-muted-foreground'>
                {t('extracted.admin.reportsClient.status_920e413c')}
              </th>
              {viewerTier === 'staff' ? (
                <>
                  <th className='px-6 py-3 text-left text-xs font-medium uppercase text-muted-foreground'>
                    {t('extracted.admin.reportsClient.judgement_18d3597c')}
                  </th>
                  <th className='px-6 py-3 text-left text-xs font-medium uppercase text-muted-foreground'>
                    {t('extracted.admin.reportsClient.note_d8da2c49')}
                  </th>
                  <th className='px-6 py-3 text-left text-xs font-medium uppercase text-muted-foreground'>
                    {t('extracted.admin.reportsClient.resolvedBy_f266c7ec')}
                  </th>
                  <th className='px-6 py-3 text-left text-xs font-medium uppercase text-muted-foreground'>
                    {t('extracted.admin.reportsClient.modNotes_4c351afd')}
                  </th>
                  <th className='px-6 py-3 text-left text-xs font-medium uppercase text-muted-foreground'>
                    {t('extracted.admin.reportsClient.actions_ff8059dc')}
                  </th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody className='divide-y divide-border bg-card'>
            {viewerTier === 'staff'
              ? (reports as AdminModerationReport[]).map(report => (
                  <AdminReportRow
                    key={report.id}
                    active={activeKey === report.id}
                    disabled={
                      loadingId !== null || rerunningId !== null || isRefreshing || bulkLoading
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
      <div className='flex gap-4'>
        {(data.page_info.has_previous_page ?? Boolean(currentAfter)) &&
        data.page_info.start_cursor ? (
          <Link
            href={buildReportsPageHref({
              before: data.page_info.start_cursor,
              status: statusFilter,
              sort: sortOrder,
              cluster: clusterMode,
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
              cluster: clusterMode,
            })}
            className='text-sm underline'
            prefetch={false}
          >
            {t('extracted.admin.reportsClient.nextPage_c08ac736')}
          </Link>
        ) : null}
      </div>
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

function StaffSortItems() {
  const t = useTranslations()
  return (
    <>
      <SelectItem value='severity'>
        {t('extracted.admin.reportsClient.severity_5e9f9812')}
      </SelectItem>
      <SelectItem
        value='most_reported'
        data-pw='reports-sort-option-most-reported'
      >
        {t('extracted.admin.reportsClient.mostReported_7838addd')}
      </SelectItem>
      <SelectItem value='created_at_asc'>
        {t('extracted.admin.reportsClient.oldestFirst_6e2ebdab')}
      </SelectItem>
      <SelectItem value='created_at_desc'>
        {t('extracted.admin.reportsClient.newestFirst_ffb6f576')}
      </SelectItem>
    </>
  )
}

function MemberSortItems() {
  const t = useTranslations()
  return (
    <>
      <SelectItem value='created_at_desc'>
        {t('extracted.admin.reportsClient.newestFirst_ffb6f576')}
      </SelectItem>
      <SelectItem value='created_at_asc'>
        {t('extracted.admin.reportsClient.oldestFirst_6e2ebdab')}
      </SelectItem>
    </>
  )
}

function isClusteredReportsResponse(
  data: AdminModerationReportsResponse | AdminClusteredModerationReportsResponse,
): data is AdminClusteredModerationReportsResponse {
  return 'cluster_mode' in data
}
