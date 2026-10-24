import { Suspense } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TrendingFeedsStreaming } from '@/components/home/trending-feeds-streaming'
import type { TrendingFeedsViewModel } from '@/lib/view-models/homepage-view-models'
import { StoryFrame } from '@/storybook/story-frame'

const meta = { title: 'Home/Trending Feeds Streaming' } satisfies Meta
export default meta
type Story = StoryObj<typeof meta>

const feeds: TrendingFeedsViewModel = [
  {
    id: 'feed-card-guide',
    title: 'Card Rewards Weekly',
    displayName: 'Card Rewards',
    href: '/sources',
  },
  { id: 'feed-travel', title: 'Travel Points Journal', displayName: 'Travel', href: '/sources' },
]
const feedsPromise = Promise.resolve(feeds)

export const WithFeeds: Story = {
  render: () => (
    <StoryFrame>
      <Suspense fallback={<p>Loading feeds</p>}>
        <TrendingFeedsStreaming dataPromise={feedsPromise} />
      </Suspense>
    </StoryFrame>
  ),
}
