import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CopyrightEmailReview } from '@/components/copyright/copyright-email-review'
import { CopyrightEmailReviewDetailPane } from '@/components/copyright/copyright-email-review-detail-pane'
import { CopyrightEmailReviewQueueList } from '@/components/copyright/copyright-email-review-queue'
import type { CopyrightEmailReviewQueue } from '@/components/copyright/copyright-email-review-queue-state'
import {
  makeCopyrightEmailQueueItem,
  makeCopyrightEmailQueuePage,
} from '@/test-helpers/components/copyright/copyright-email-review'

const queueItem = makeCopyrightEmailQueueItem()

const emptyQueue = {
  items: [],
  hasNextPage: false,
  endCursor: null,
  loadingMore: false,
  fetchError: null,
  clearError: () => undefined,
  resetKey: 'copyright-email-review-story',
  loadMore: () => undefined,
  refreshTimedOut: false,
} as unknown as CopyrightEmailReviewQueue

const meta = {
  title: 'Copyright/Email Review',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const ReviewQueue: Story = {
  render: () => <CopyrightEmailReview data={makeCopyrightEmailQueuePage()} />,
}

export const DetailPane: Story = {
  render: () => (
    <CopyrightEmailReviewDetailPane
      items={[queueItem]}
      refreshTimedOut={false}
      resetToFirstPage={undefined}
    >
      {review => {
        const handleSelectQueueItem = review.selectQueueItem
        return (
          <CopyrightEmailReviewQueueList
            queue={emptyQueue}
            loading={review.loading}
            onSelect={handleSelectQueueItem}
            resetQueue={() => undefined}
            setError={review.setError}
            setSuccess={review.setSuccess}
          />
        )
      }}
    </CopyrightEmailReviewDetailPane>
  ),
}
