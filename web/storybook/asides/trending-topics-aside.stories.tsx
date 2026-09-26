import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { topics } from '@/storybook/entities/fixtures/topics'
import { StoryFrame } from '@/storybook/story-frame'
import { TrendingTopicsAsideContent } from '../../components/asides/trending-topics-aside-content'

const meta = {
  title: 'Asides/Trending Topics Aside',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const trending = [topics[1]!, topics[3]!].flatMap(topic =>
  topic.slug
    ? [{ id: topic.id, name: topic.name, topic_type: topic.topic_type, slug: topic.slug }]
    : [],
)

export const CardsAndRewards: Story = {
  render: () => (
    <StoryFrame width='max-w-sm'>
      <TrendingTopicsAsideContent
        heading='Trending topics'
        browseLabel='Browse all topics'
        topics={trending}
      />
    </StoryFrame>
  ),
}
