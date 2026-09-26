import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ClaimTopicForm } from '@/components/topic-claims/claim-topic-form'
import { StoryFrame } from '@/storybook/story-frame'
import { topics } from '@/storybook/entities/fixtures/topics'

const topic = topics.find(item => item.topic_type === 'rss_feed')!

const meta = {
  title: 'Topic Claims/Claim Topic Form',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Publisher: Story = {
  render: () => (
    <StoryFrame>
      <ClaimTopicForm
        topicIdOrSlug={topic.slug}
        onSuccess={() => undefined}
      />
    </StoryFrame>
  ),
}
