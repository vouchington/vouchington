import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TopicRecommendationFilters } from '@/components/topic-recommendations/topic-recommendation-filters'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Topic Recommendations/Filters',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const AllStatuses: Story = {
  render: () => (
    <StoryFrame>
      <TopicRecommendationFilters />
    </StoryFrame>
  ),
}

export const Pending: Story = {
  parameters: {
    nextjs: { navigation: { pathname: '/topic-recommendations', query: { status: 'pending' } } },
  },
  render: () => (
    <StoryFrame>
      <TopicRecommendationFilters />
    </StoryFrame>
  ),
}
