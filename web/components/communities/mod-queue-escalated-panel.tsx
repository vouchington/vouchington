'use client'

import { useTranslations } from '@/lib/i18n/use-translations'
import { ModQueuePosts } from './mod-queue-posts'
import { ModQueueReports } from './mod-queue-reports'
import type { ModQueueData } from './use-mod-queue-data'
import type { ModQueueItemActions } from './use-mod-queue-item-actions'
import type { ModQueueSelection } from './use-mod-queue-selection'

export function ModQueueEscalatedPanel({
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
  const escalatedCount = queue.escalatedReports.length + queue.escalatedPosts.length
  if (escalatedCount === 0) {
    return (
      <p
        className='py-6 text-center text-sm text-muted-foreground'
        data-pw='mod-queue-escalated-empty'
      >
        {t('extracted.communities.modQueue.noEscalatedItems_3305d869')}
      </p>
    )
  }

  return (
    <div
      className='space-y-6'
      data-pw='mod-queue-escalated'
    >
      {queue.escalatedReports.length > 0 && (
        <section className='space-y-3'>
          <h3 className='text-sm font-semibold uppercase text-muted-foreground'>
            {t('extracted.communities.modQueue.escalatedReports_62af1d2c')}
          </h3>
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
            reports={queue.escalatedReports}
            selectedIds={selection.selectedReportIds}
          />
        </section>
      )}
      {queue.escalatedPosts.length > 0 && (
        <section className='space-y-3'>
          <h3 className='text-sm font-semibold uppercase text-muted-foreground'>
            {t('extracted.communities.modQueue.escalatedPosts_2404107b')}
          </h3>
          <ModQueuePosts
            activeAction={queue.state.activeAction}
            activeKey={activeKey}
            bulkDisabled={selection.mutationsDisabled}
            communitySlug={communitySlug}
            currentUserId={currentUserId}
            loading={queue.state.loading}
            onActiveChange={onActiveChange}
            onApprove={actions.handleApprove}
            onCancelReject={() => queue.dispatch({ type: 'reject-cancelled' })}
            onRejectStart={postId => queue.dispatch({ type: 'reject-started', postId })}
            onRejectSubmit={actions.handleRejectSubmit}
            onRejectionReasonChange={value =>
              queue.dispatch({ type: 'reject-reason-changed', value })
            }
            onSelectionToggle={postId => selection.toggleSelected(`post:${postId}`)}
            posts={queue.escalatedPosts}
            rejectionReason={queue.state.rejectionReason}
            selectedIds={selection.selectedPostIds}
          />
        </section>
      )}
    </div>
  )
}
