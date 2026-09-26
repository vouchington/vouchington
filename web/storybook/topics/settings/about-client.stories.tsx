import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { AboutClient } from '@/components/topics/settings/about-client'
import { StoryFrame } from '@/storybook/story-frame'
import { topics } from '@/storybook/entities/fixtures/topics'

const topic = topics[0]!

const meta = {
  title: 'Topics/About',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const OpenBanking: Story = {
  render: () => (
    <StoryFrame>
      <AboutClient
        id={topic.id}
        topicType='topic'
        initialData={{ topic, topicTypeValue: 'topic', loading: false, loadError: null }}
      />
    </StoryFrame>
  ),
}

export const NotFound: Story = {
  render: () => (
    <StoryFrame>
      <AboutClient
        id='topic-missing'
        topicType='topic'
        initialData={{ topic: null, loading: false, loadError: null }}
      />
    </StoryFrame>
  ),
}
