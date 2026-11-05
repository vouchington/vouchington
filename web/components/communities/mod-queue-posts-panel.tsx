'use client'

import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { useTranslations } from '@/lib/i18n/use-translations'
import { ModQueuePosts } from './mod-queue-posts'
import type { ModQueueData } from './use-mod-queue-data'
import type { ModQueueItemActions } from './use-mod-queue-item-actions'
import type { ModQueueSelection } from './use-mod-queue-selection'

export function ModQueuePostsPanel({
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
  const { clearError, endCursor, fetchError, hasNextPage, loadMore, loadingMore, resetKey } = queue
  if (queue.pendingPosts.length === 0) {
    return (
      <p
        className='py-6 text-center text-sm text-muted-foreground'
        data-pw='mod-queue-posts-empty'
      >
        {t('extracted.communities.modQueue.noPendingPosts_df860938')}
      </p>
    )
  }

  return (
    <InfiniteScroll
      hasNextPage={hasNextPage}
      endCursor={endCursor}
      onLoadMore={loadMore}
      loadingMore={loadingMore}
      fetchError={fetchError}
      clearError={clearError}
      resetKey={resetKey}
    >
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
        onRejectionReasonChange={value => queue.dispatch({ type: 'reject-reason-changed', value })}
        onSelectionToggle={postId => selection.toggleSelected(`post:${postId}`)}
        posts={queue.pendingPosts}
        rejectionReason={queue.state.rejectionReason}
        selectedIds={selection.selectedPostIds}
      />
    </InfiniteScroll>
  )
}
