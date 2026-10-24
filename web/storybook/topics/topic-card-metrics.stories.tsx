import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TopicCardMetrics } from '@/components/topics/topic-card-metrics'
import { topics, topicsResponse } from '@/storybook/entities/fixtures/topics'
import { StoryFrame } from '@/storybook/story-frame'

const card = topics.find(topic => topic.topic_type === 'card')!

const meta = {
  title: 'Topics/Card Metrics',
  component: TopicCardMetrics,
} satisfies Meta<typeof TopicCardMetrics>

export default meta
type Story = StoryObj<typeof meta>

export const RatedCard: Story = {
  args: {
    topic: card,
    metrics: topicsResponse.topics_metrics[card.id],
  },
  render: args => (
    <StoryFrame>
      <TopicCardMetrics {...args} />
    </StoryFrame>
  ),
}
