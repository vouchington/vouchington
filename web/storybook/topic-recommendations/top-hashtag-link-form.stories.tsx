import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { TopHashtagLinkForm } from '@/components/topic-recommendations/top-hashtag-link-form'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Topic Recommendations/Top Hashtag Link Form',
  component: TopHashtagLinkForm,
} satisfies Meta<typeof TopHashtagLinkForm>

export default meta
type Story = StoryObj<typeof meta>

export const TopicSelected: Story = {
  args: {
    selectedTopic: { id: 'storybook-topic', name: 'Travel' },
    onCancel: fn(),
    onLink: fn(),
    onSelect: fn(),
  },
  render: args => (
    <StoryFrame>
      <TopHashtagLinkForm {...args} />
    </StoryFrame>
  ),
}
