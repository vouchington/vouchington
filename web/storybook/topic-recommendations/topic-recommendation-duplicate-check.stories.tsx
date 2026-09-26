import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TopicRecommendationDuplicateCheck } from '@/components/topic-recommendations/topic-recommendation-duplicate-check'
import { StoryFrame } from '@/storybook/story-frame'
import { topics } from '@/storybook/entities/fixtures/topics'

const openBanking = topics[0]!
const sapphire = topics[1]!
const rewards = topics.find(topic => topic.name === 'Ultimate Rewards')!

const meta = {
  title: 'Topic Recommendations/Duplicate Check',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const ExactTopic: Story = {
  render: () => (
    <StoryFrame>
      <TopicRecommendationDuplicateCheck
        isBelowMinLength={false}
        isLoading={false}
        data={{
          exact_topic: {
            id: openBanking.id,
            name: openBanking.name,
            slug: openBanking.slug,
            topic_type: openBanking.topic_type,
          },
          pending_recommendations: [],
          similar_topics: [],
        }}
      />
    </StoryFrame>
  ),
}

export const SimilarTopics: Story = {
  render: () => (
    <StoryFrame>
      <TopicRecommendationDuplicateCheck
        isBelowMinLength={false}
        isLoading={false}
        data={{
          exact_topic: null,
          pending_recommendations: [
            {
              post_id: 'topic-recommendation-story',
              topic_title: sapphire.name,
              topic_slug: sapphire.slug,
            },
          ],
          similar_topics: [
            {
              id: rewards.id,
              name: rewards.name,
              slug: rewards.slug,
              topic_type: rewards.topic_type,
            },
          ],
        }}
      />
    </StoryFrame>
  ),
}
