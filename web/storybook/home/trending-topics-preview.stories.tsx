import { Suspense } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TrendingTopicsPreview } from '@/components/home/trending-topics-preview'
import { TrendingTopicsPreviewStreaming } from '@/components/home/trending-topics-preview-streaming'
import type { TrendingTopicsViewModel } from '@/lib/view-models/homepage-view-models'
import { getTopicTypeLabel } from '@/types/topics'
import { StoryFrame } from '@/storybook/story-frame'

const meta = { title: 'Home/Trending Topics Preview' } satisfies Meta
export default meta
type Story = StoryObj<typeof meta>

const topics: TrendingTopicsViewModel = [
  {
    id: 'topic-travel',
    name: 'Travel rewards',
    href: '/topics/travel-rewards',
    typeLabel: getTopicTypeLabel('tag'),
    allowReviews: true,
    averageRating: 4.6,
    followerCount: 1200,
  },
  {
    id: 'topic-cards',
    name: 'Credit cards',
    href: '/topics/credit-cards',
    typeLabel: getTopicTypeLabel('tag'),
    allowReviews: false,
    averageRating: null,
    followerCount: 480,
  },
]
const topicsPromise = Promise.resolve(topics)

export const Streaming: Story = {
  render: () => (
    <StoryFrame>
      <Suspense fallback={<p>Loading topics</p>}>
        <TrendingTopicsPreviewStreaming dataPromise={topicsPromise} />
      </Suspense>
    </StoryFrame>
  ),
}

export const Direct: Story = {
  render: () => (
    <StoryFrame>
      <TrendingTopicsPreview data={topics} />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame>
      <TrendingTopicsPreview data={null} />
    </StoryFrame>
  ),
}
