import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TopicRecommendationDialogStatusInfo } from '@/components/topic-recommendations/topic-recommendation-dialog-status-info'
import { StoryFrame } from '@/storybook/story-frame'
import {
  approvedRecommendationPost,
  rejectedRecommendationPost,
  storyReviewerUsers,
} from '@/storybook/entities/topics-story-recommendations'

const meta = {
  title: 'Topic Recommendations/Dialog Status Info',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Approved: Story = {
  render: () => (
    <StoryFrame>
      <TopicRecommendationDialogStatusInfo
        selected={approvedRecommendationPost}
        users={storyReviewerUsers}
      />
    </StoryFrame>
  ),
}

export const Rejected: Story = {
  render: () => (
    <StoryFrame>
      <TopicRecommendationDialogStatusInfo
        selected={rejectedRecommendationPost}
        users={storyReviewerUsers}
      />
    </StoryFrame>
  ),
}
