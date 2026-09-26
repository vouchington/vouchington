import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TopicRecommendationDialogFooter } from '@/components/topic-recommendations/topic-recommendation-dialog-footer'
import { StoryFrame } from '@/storybook/story-frame'
import { recommendationPost } from '@/storybook/entities/topics-story-recommendations'

const previousRef = { current: null as HTMLButtonElement | null }
const nextRef = { current: null as HTMLButtonElement | null }
const election = {
  id: 'post-election-topic-recommendation-story',
  votes_count_up: 5,
  votes_count_down: 1,
}

const meta = {
  title: 'Topic Recommendations/Dialog Footer',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const AdminReview: Story = {
  render: () => (
    <StoryFrame>
      <TopicRecommendationDialogFooter
        hasPrevious
        hasNext
        hideDownCount={false}
        isAdmin
        isSaving={false}
        nextRef={nextRef}
        onApprove={async () => undefined}
        onNavigateNext={() => undefined}
        onNavigatePrevious={() => undefined}
        onPersistChanges={async () => undefined}
        onReject={async () => undefined}
        previousRef={previousRef}
        selected={recommendationPost}
        selectedElection={election}
      />
    </StoryFrame>
  ),
}

export const Member: Story = {
  render: () => (
    <StoryFrame>
      <TopicRecommendationDialogFooter
        hasPrevious
        hasNext={false}
        hideDownCount={false}
        isAdmin={false}
        isSaving={false}
        nextRef={nextRef}
        onApprove={async () => undefined}
        onNavigateNext={() => undefined}
        onNavigatePrevious={() => undefined}
        onPersistChanges={async () => undefined}
        onReject={async () => undefined}
        previousRef={previousRef}
        selected={recommendationPost}
        selectedElection={election}
      />
    </StoryFrame>
  ),
}
