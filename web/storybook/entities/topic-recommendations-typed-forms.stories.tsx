import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TopicRecommendationForm } from '@/components/topic-recommendations/topic-recommendation-form'
import { TopicTypeSelectField } from '@/components/topic-recommendations/topic-type-select-field'
import { TopicRecommendationTypeSpecificFields } from '@/components/topic-recommendations/topic-recommendation-type-specific-fields'
import { getRecommendationFormDefaults } from '@/components/topic-recommendations/topic-recommendation-form-codecs'
import type { TopicRecommendationTopicType } from '@/components/topic-recommendations/topic-recommendation-topic-type'
import { EntityStoryFrame } from './entity-story-frame'

const meta = {
  title: 'Entities/TopicRecommendations',
  parameters: { auth: { currentUser: null } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const CreateReferralProgramForm: Story = {
  render: () => (
    <EntityStoryFrame title='Recommend a referral program'>
      <fieldset disabled>
        <TopicRecommendationForm initialType='referral_program' />
      </fieldset>
    </EntityStoryFrame>
  ),
}

export const CreateCardForm: Story = {
  render: () => (
    <EntityStoryFrame title='Recommend a card'>
      <fieldset disabled>
        <TopicRecommendationForm initialType='card' />
      </fieldset>
    </EntityStoryFrame>
  ),
}

function TopicTypeSelectFieldStandalone() {
  const [value, setValue] = useState<TopicRecommendationTopicType>('topic')
  return (
    <TopicTypeSelectField
      value={value}
      onValueChange={setValue}
    />
  )
}

export const TopicTypeSelect: Story = {
  render: () => (
    <EntityStoryFrame title='Topic type field'>
      <TopicTypeSelectFieldStandalone />
    </EntityStoryFrame>
  ),
}

export const ReferralProgramTypeSpecificFields: Story = {
  render: () => (
    <EntityStoryFrame title='Referral program type-specific fields'>
      <TopicRecommendationTypeSpecificFields
        topicType='referral_program'
        defaults={getRecommendationFormDefaults()}
      />
    </EntityStoryFrame>
  ),
}

export const CardTypeSpecificFields: Story = {
  render: () => (
    <EntityStoryFrame title='Card type-specific fields'>
      <TopicRecommendationTypeSpecificFields
        topicType='card'
        defaults={getRecommendationFormDefaults()}
      />
    </EntityStoryFrame>
  ),
}
