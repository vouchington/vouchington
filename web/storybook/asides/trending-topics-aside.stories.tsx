import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TrendingTopicsAside } from '@/components/asides/trending-topics-aside'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Asides/Trending Topics Aside',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const CardsAndRewards: Story = {
  render: () => (
    <StoryFrame width='max-w-sm'>
      <TrendingTopicsAside />
    </StoryFrame>
  ),
}
