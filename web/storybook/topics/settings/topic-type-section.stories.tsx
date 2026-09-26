import type { FormEvent } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TopicTypeSection } from '@/components/topics/settings/topic-type-section'
import { StoryFrame } from '@/storybook/story-frame'

const prevent = (event: FormEvent) => event.preventDefault()

const meta = {
  title: 'Topics/Topic Type',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Card: Story = {
  render: () => (
    <StoryFrame>
      <TopicTypeSection
        topicTypeValue='card'
        typeSaving={false}
        onTypeSubmit={prevent}
        setTopicTypeValue={() => undefined}
      />
    </StoryFrame>
  ),
}

export const RssFeedLocked: Story = {
  render: () => (
    <StoryFrame>
      <TopicTypeSection
        disabled
        topicTypeValue='rss_feed'
        typeSaving={false}
        onTypeSubmit={prevent}
        setTopicTypeValue={() => undefined}
      />
    </StoryFrame>
  ),
}
