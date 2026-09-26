import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ShowMoreLink, StoryMeta } from '@/components/news/news-item-cluster-meta'
import { StoryFrame } from '@/storybook/story-frame'
import { newsResponse } from '@/storybook/entities/fixtures/feeds'

const meta = {
  title: 'News/Story Meta',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const transferBonus = newsResponse.stories?.['story-transfer-bonus']

export const Clustered: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <StoryMeta story={transferBonus} />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <StoryMeta />
    </StoryFrame>
  ),
}

export const ShowMore: Story = {
  render: () => (
    <StoryFrame width='max-w-sm'>
      <ShowMoreLink href='/news/story-transfer-bonus' />
    </StoryFrame>
  ),
}
