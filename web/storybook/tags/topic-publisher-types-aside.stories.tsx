import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TopicPublisherTypesAside } from '@/components/tags/topic-publisher-types-aside'
import { StoryFrame } from '@/storybook/story-frame'
import { topics } from '@/storybook/entities/fixtures/topics'

const feed = topics.find(topic => topic.topic_type === 'rss_feed')!

const meta = {
  title: 'Tags/Topic Publisher Types Aside',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Feed: Story = {
  render: () => (
    <StoryFrame>
      <TopicPublisherTypesAside
        topic={feed}
        isAuthenticated
      />
    </StoryFrame>
  ),
}

export const SignedOut: Story = {
  parameters: { auth: { currentUser: null } },
  render: () => (
    <StoryFrame>
      <TopicPublisherTypesAside
        topic={feed}
        isAuthenticated={false}
      />
    </StoryFrame>
  ),
}
