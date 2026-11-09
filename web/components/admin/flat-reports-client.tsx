'use client'

import { useMemo } from 'react'
import { AdminTableShell } from '@/components/admin/admin-table-shell'
import { KeyboardShortcutsDialog } from '@/components/keyboard-shortcuts-dialog'
import { BulkActionToolbar } from '@/components/moderation/bulk-action-toolbar'
import { useModerationQueueHotkeys } from '@/components/moderation/use-moderation-queue-hotkeys'
import { MODERATION_QUEUE_SHORTCUTS } from '@/lib/keyboard-shortcuts'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { MemberModerationReport } from '@/lib/api/client/reports'
import { AdminReportRow } from './admin-report-row'
import { MemberReportRow } from './member-report-row'
import { countReporters } from './reports-bulk-operations'
import { buildReportHotkeyItems } from './reports-hotkey-items'
import { ReportsPagination, ReportsSortSelect } from './reports-navigation'
import { ReportsTableHeader } from './reports-table-header'
import type { AdminModerationReport } from './reports-client-types'
import { useFlatReportsState, type FlatReportsClientProps } from './use-flat-reports-state'

export function FlatReportsClient(props: FlatReportsClientProps) {
  const t = useTranslations()
  const { viewerTier, data, statusFilter, sortOrder, canBulkRemove, currentAfter, clusterMode } =
    props
  const {
    bulkAction,
    bulkLoading,
    bulkMessage,
    handleBanEvasionAction,
    handleBulkConfirm,
    handleRerun,
    handleResolve,
    handleWarn,
    isRefreshing,
    loadingId,
    pendingRerunEntities,
    pollingTimedOut,
    reports,
    rerunTimedOut,
    rerunFailed,
    rerunningId,
    selectedIds,
    setBulkAction,
    setBulkMessage,
    setSelectedIds,
    toggleSelected,
  } = useFlatReportsState(props)
  const reporterCount = useMemo(() => {
    if (viewerTier !== 'staff') return null
    return countReporters(reports as AdminModerationReport[])
  }, [reports, viewerTier])
  const hotkeyItems = buildReportHotkeyItems(
    viewerTier === 'staff' ? (reports as AdminModerationReport[]) : [],
    pendingRerunEntities,
    handleResolve,
  )
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
      {rerunFailed && (
        <output className='block text-sm text-muted-foreground'>
          AI judgement could not be completed. You can re-run it.
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
        isEmpty={reports.length === 0}
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
