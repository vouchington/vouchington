import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { MergeClient } from '@/components/topics/settings/merge-client'
import { StoryFrame } from '@/storybook/story-frame'
import { topics } from '@/storybook/entities/fixtures/topics'

const source = topics.find(topic => topic.name === 'Jane Analyst')!

const meta = {
  title: 'Topics/Merge',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const JaneAnalyst: Story = {
  render: () => (
    <StoryFrame>
      <MergeClient topic={source} />
    </StoryFrame>
  ),
}
