'use client'

import type { CopyrightEmailIntakeQueuePage } from '@/types/copyright-notices'
import { CopyrightEmailReviewDetailPane } from './copyright-email-review-detail-pane'
import { CopyrightEmailReviewQueueList } from './copyright-email-review-queue'
import { useCopyrightEmailReviewQueue } from './copyright-email-review-queue-state'

export function CopyrightEmailReview({ data }: { data: CopyrightEmailIntakeQueuePage }) {
  const queue = useCopyrightEmailReviewQueue(data)
  return (
    <main className='mx-auto max-w-4xl space-y-4 py-8'>
      <h1 className='text-3xl font-bold'>Copyright email review</h1>
      <p className='text-muted-foreground'>
        Staff must verify each parsed email and approve, reject, or ask the sender for more
        information before any case action.
      </p>
      <CopyrightEmailReviewDetailPane
        items={queue.items}
        refreshTimedOut={queue.refreshTimedOut}
        resetToFirstPage={queue.resetToFirstPage}
      >
        {review => {
          const handleSelectQueueItem = review.selectQueueItem
          return (
            <CopyrightEmailReviewQueueList
              queue={queue}
              loading={review.loading}
              onSelect={handleSelectQueueItem}
              resetQueue={page => {
                queue.resetToFirstPage?.(page)
              }}
              setError={review.setError}
              setSuccess={review.setSuccess}
            />
          )
        }}
      </CopyrightEmailReviewDetailPane>
    </main>
  )
}
