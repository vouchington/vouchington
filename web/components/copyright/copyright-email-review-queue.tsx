'use client'

import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import type { CopyrightEmailIntakeQueuePage } from '@/types/copyright-notices'
import { CopyrightEmailQueueItem } from './copyright-email-queue-item'
import type { CopyrightEmailReviewQueue } from './copyright-email-review-queue-state'

export function CopyrightEmailReviewQueueList({
  queue,
  loading,
  onSelect,
  resetQueue,
  setError,
  setSuccess,
}: {
  queue: CopyrightEmailReviewQueue
  loading: boolean
  onSelect: (id: string) => void
  resetQueue: (page: CopyrightEmailIntakeQueuePage) => void
  setError: (value: string | null) => void
  setSuccess: (value: string | null) => void
}) {
  if (queue.items.length === 0 && !queue.hasNextPage) {
    return <p className='text-muted-foreground'>No copyright emails need review.</p>
  }
  const handleLoadMore = queue.loadMore
  return (
    <InfiniteScroll
      hasNextPage={queue.hasNextPage}
      endCursor={queue.endCursor}
      onLoadMore={handleLoadMore}
      loadingMore={queue.loadingMore}
      fetchError={queue.fetchError}
      clearError={queue.clearError}
      resetKey={queue.resetKey}
    >
      <ul className='space-y-1'>
        {queue.items.map(item => (
          <CopyrightEmailQueueItem
            key={item.id}
            item={item}
            disabled={loading}
            onSelect={onSelect}
            resetQueue={resetQueue}
            setError={setError}
            setSuccess={setSuccess}
          />
        ))}
      </ul>
    </InfiniteScroll>
  )
}
