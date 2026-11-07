'use client'

import {
  BulkActionToolbar,
  type ModerationBulkAction,
} from '@/components/moderation/bulk-action-toolbar'
import { ExposureCooldownGate } from '@/components/moderation/exposure-cooldown-gate'
import { useExposureCooldown } from '@/components/moderation/use-exposure-cooldown'
import { KeyboardShortcutsDialog } from '@/components/keyboard-shortcuts-dialog'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { MODERATION_QUEUE_SHORTCUTS } from '@/lib/keyboard-shortcuts'
import { useTranslations } from '@/lib/i18n/use-translations'
import { ModQueueTabs } from './mod-queue-tabs'
import type { ModQueueTab } from './mod-queue-state'
import type { ModQueueData } from './use-mod-queue-data'
import type { ModQueueItemActions } from './use-mod-queue-item-actions'
import type { ModQueueSelection } from './use-mod-queue-selection'

export function ModQueueView({
  actions,
  activeKey,
  activeTab,
  communitySlug,
  currentUserId,
  onActiveChange,
  onBulkConfirm,
  onShortcutsOpenChange,
  onTabChange,
  queue,
  selection,
  shortcutsOpen,
}: {
  actions: ModQueueItemActions
  activeKey: string | null
  activeTab: ModQueueTab
  communitySlug: string
  currentUserId: string | null
  onActiveChange: (key: string) => void
  onBulkConfirm: (action: ModerationBulkAction) => void
  onShortcutsOpenChange: (open: boolean) => void
  onTabChange: (value: string) => void
  queue: ModQueueData
  selection: ModQueueSelection
  shortcutsOpen: boolean
}) {
  const t = useTranslations()
  const cooldown = useExposureCooldown()
  const {
    bulkAction,
    bulkMessage,
    bulkReason,
    mutationsDisabled,
    selectedKeys,
    setBulkAction,
    setBulkMessage,
    setBulkReason,
    setSelectedKeys,
  } = selection

  if (
    queue.posts.length === 0 &&
    queue.reports.length === 0 &&
    !queue.hasNextPage &&
    !queue.reportPagination.hasNextPage
  ) {
    return (
      <div
        className='rounded-md border bg-card p-4 text-center'
        data-pw='mod-queue-empty'
      >
        <p className='text-muted-foreground'>
          {t('extracted.communities.modQueue.noPostsOrReportsPendingReview_2f0c01ac')}
        </p>
      </div>
    )
  }

  return (
    <ExposureCooldownGate cooldown={cooldown}>
      <div className='space-y-4'>
        {queue.state.error && (
          <div className='rounded-md bg-destructive/10 p-3 text-sm text-destructive'>
            {queue.state.error}
          </div>
        )}
        <BulkActionToolbar
          action={bulkAction}
          disabled={mutationsDisabled}
          message={bulkMessage}
          onActionChange={setBulkAction}
          onClearSelection={() => {
            setSelectedKeys(new Set())
            setBulkAction(null)
            setBulkMessage(null)
          }}
          onConfirm={onBulkConfirm}
          onRemoveReasonChange={setBulkReason}
          removeReason={bulkReason}
          selectedCount={selectedKeys.size}
          showRemoveReason
        />
        <ModQueueTabs
          actions={actions}
          activeKey={activeKey}
          activeTab={activeTab}
          communitySlug={communitySlug}
          currentUserId={currentUserId}
          onActiveChange={onActiveChange}
          onTabChange={onTabChange}
          queue={queue}
          selection={selection}
        />
        {activeTab !== 'posts' ? (
          <InfiniteScroll
            hasNextPage={queue.reportPagination.hasNextPage}
            endCursor={queue.reportPagination.endCursor}
            onLoadMore={queue.handleLoadMoreReports}
            loadingMore={queue.reportPagination.loadingMore}
            fetchError={queue.reportPagination.fetchError}
            clearError={queue.reportPagination.clearError}
            resetKey={queue.reportPagination.resetKey}
          >
            {null}
          </InfiniteScroll>
        ) : null}
      </div>
      <KeyboardShortcutsDialog
        description={t(
          'extracted.communities.modQueue.shortcutsForTheActiveModerationQueue_d1e2ea56',
        )}
        open={shortcutsOpen}
        onOpenChange={onShortcutsOpenChange}
        shortcuts={MODERATION_QUEUE_SHORTCUTS}
        title={t('extracted.communities.modQueue.moderationShortcuts_47c378cf')}
        viewAllLink={false}
      />
    </ExposureCooldownGate>
  )
}
