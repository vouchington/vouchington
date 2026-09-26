import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { BehaviorClient } from '@/components/topics/settings/behavior-client'
import { StoryFrame } from '@/storybook/story-frame'
import { topics } from '@/storybook/entities/fixtures/topics'

const card = topics.find(topic => topic.topic_type === 'card')!
const person = topics.find(topic => topic.name === 'Jane Analyst')!

const meta = {
  title: 'Topics/Behavior',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Card: Story = {
  render: () => (
    <StoryFrame>
      <BehaviorClient
        id={card.id}
        topicType='card'
        initialData={{
          topic: card,
          topicTypeValue: 'card',
          loading: false,
          loadError: null,
          isForeignTransaction: true,
          spendingFrequency: 'monthly',
          typeAttributes: { annual_fee: { amount: 79_500, currency: 'usd' } },
          typeAttributeNames: {},
        }}
      />
    </StoryFrame>
  ),
}

export const NotFound: Story = {
  render: () => (
    <StoryFrame>
      <BehaviorClient
        id={person.id}
        topicType='topic'
        initialData={{ topic: null, loading: false, loadError: null }}
      />
    </StoryFrame>
  ),
}
