import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TopicAboutCopy } from '@/components/topics/topic-about-copy'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Topics/About Copy',
  component: TopicAboutCopy,
} satisfies Meta<typeof TopicAboutCopy>

export default meta
type Story = StoryObj<typeof meta>

export const Description: Story = {
  args: {
    markdown: 'A community for discussing travel rewards and credit card benefits.',
    detectedLanguage: 'en',
  },
  render: args => (
    <StoryFrame>
      <TopicAboutCopy {...args} />
    </StoryFrame>
  ),
}
