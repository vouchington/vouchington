import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TopicRecommendationFormFields } from '@/components/topic-recommendations/topic-recommendation-form-fields'
import { getRecommendationFormDefaults } from '@/components/topic-recommendations/topic-recommendation-form-codecs'
import { StoryFrame } from '@/storybook/story-frame'
import { recommendationPost } from '@/storybook/entities/topics-story-recommendations'

const meta = {
  title: 'Topic Recommendations/Form Fields',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const ProposedRewardsProgram: Story = {
  render: () => (
    <StoryFrame>
      <TopicRecommendationFormFields
        defaults={getRecommendationFormDefaults(recommendationPost)}
        onTitleSlugChange={() => undefined}
      />
    </StoryFrame>
  ),
}

export const Blank: Story = {
  render: () => (
    <StoryFrame>
      <TopicRecommendationFormFields defaults={getRecommendationFormDefaults()} />
    </StoryFrame>
  ),
}
