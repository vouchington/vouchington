import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TopicRecommendationRowActions } from '@/components/topic-recommendations/topic-recommendation-row-actions'
import { EntityStoryFrame } from './entity-story-frame'
import { recommendationPost } from './topics-story-recommendations'

const meta = {
  title: 'Entities/TopicRecommendationRowActions',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const noop = () => {}

export const AdminAndOwnerStates: Story = {
  render: () => (
    <EntityStoryFrame title='Topic recommendation row actions'>
      <div className='flex flex-col gap-4'>
        <TopicRecommendationRowActions
          isAdmin
          isOwner={false}
          isPending
          post={recommendationPost}
          onQuickApprove={noop}
          onQuickReject={noop}
          onWithdraw={noop}
        />
        <TopicRecommendationRowActions
          isAdmin={false}
          isOwner
          isPending
          post={recommendationPost}
          onQuickApprove={noop}
          onQuickReject={noop}
          onWithdraw={noop}
        />
      </div>
    </EntityStoryFrame>
  ),
}
