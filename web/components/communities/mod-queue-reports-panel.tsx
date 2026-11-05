'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ModerationReportSortParam } from '@/lib/api/client/reports'
import { useTranslations } from '@/lib/i18n/use-translations'
import { ModQueueReports } from './mod-queue-reports'
import type { ModQueueData } from './use-mod-queue-data'
import type { ModQueueItemActions } from './use-mod-queue-item-actions'
import type { ModQueueSelection } from './use-mod-queue-selection'

export function ModQueueReportsPanel({
  actions,
  activeKey,
  communitySlug,
  currentUserId,
  onActiveChange,
  queue,
  selection,
}: {
  actions: ModQueueItemActions
  activeKey: string | null
  communitySlug: string
  currentUserId: string | null
  onActiveChange: (key: string) => void
  queue: ModQueueData
  selection: ModQueueSelection
}) {
  const t = useTranslations()
  if (queue.pendingReports.length === 0) {
    return (
      <p
        className='py-6 text-center text-sm text-muted-foreground'
        data-pw='mod-queue-reports-empty'
      >
        {t('extracted.communities.modQueue.noPendingReports_36379210')}
      </p>
    )
  }

  return (
    <section
      className='space-y-3'
      data-pw='mod-queue-reports'
    >
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <h3 className='text-sm font-semibold uppercase text-muted-foreground'>
          {t('extracted.communities.modQueue.reports_dacca3cb')}
        </h3>
        <Select
          value={queue.effectiveReportSort}
          onValueChange={value => queue.handleReportSortChange(value as ModerationReportSortParam)}
        >
          <SelectTrigger
            className='h-9 w-[180px]'
            aria-label={t('extracted.communities.modQueue.sortReports_87711bde')}
            data-pw='community-report-sort'
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {queue.isStaff && (
              <SelectItem value='severity'>
                {t('extracted.communities.modQueue.severity_5e9f9812')}
              </SelectItem>
            )}
            <SelectItem value='most_reported'>
              {t('extracted.communities.modQueue.mostReported_7838addd')}
            </SelectItem>
            <SelectItem value='created_at_asc'>
              {t('extracted.communities.modQueue.oldestFirst_6e2ebdab')}
            </SelectItem>
            <SelectItem value='created_at_desc'>
              {t('extracted.communities.modQueue.newestFirst_ffb6f576')}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <ModQueueReports
        bulkDisabled={selection.mutationsDisabled}
        activeKey={activeKey}
        communitySlug={communitySlug}
        currentUserId={currentUserId}
        isStaff={queue.isStaff}
        loading={queue.state.loading}
        onActiveChange={onActiveChange}
        onBanEvasionAction={actions.handleBanEvasionAction}
        onResolve={actions.handleResolveReport}
        onWarn={actions.handleWarnReport}
        onSelectionToggle={reportId => selection.toggleSelected(`report:${reportId}`)}
        reports={queue.pendingReports}
        selectedIds={selection.selectedReportIds}
      />
    </section>
  )
}
