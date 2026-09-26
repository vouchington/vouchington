import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  CandidateSelect,
  TopicGroupOptions,
  TopicSelect,
} from '@/components/my/landing-pages-manager/item-picker-fields'
import { useLandingPageItemOptions } from '@/components/my/landing-pages-manager/options'
import { StoryFrame } from '@/storybook/story-frame'
import { landingPageCandidates } from '@/storybook/entities/fixtures/landing'
import { topics } from '@/storybook/entities/fixtures/topics'

const meta = {
  title: 'My/Candidate Select',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const sapphire = topics[1]!
const review = landingPageCandidates.reviews[0]!

function PopulatedFields() {
  const [candidateId, setCandidateId] = useState(review.id)
  const [topicId, setTopicId] = useState(sapphire.id)
  const [reviewIds, setReviewIds] = useState([review.id])
  const [referralIds, setReferralIds] = useState<string[]>([])
  const options = useLandingPageItemOptions(landingPageCandidates, [], topicId)
  return (
    <div className='space-y-6'>
      <CandidateSelect
        addType='review'
        selectedCandidateId={candidateId}
        setSelectedCandidateId={setCandidateId}
        options={options}
      />
      <TopicSelect
        selectedTopicId={topicId}
        setSelectedTopicId={setTopicId}
        topicOptions={options.topicOptions}
      />
      <TopicGroupOptions
        options={options}
        selectedGroupReviewIds={reviewIds}
        selectedGroupReferralIds={referralIds}
        setSelectedGroupReviewIds={setReviewIds}
        setSelectedGroupReferralIds={setReferralIds}
      />
    </div>
  )
}

const emptyOptions = {
  availableProfileLinks: [],
  availableReviews: [],
  availableReferralLinks: [],
  availableGroupReviews: [],
  availableGroupReferralLinks: [],
  topicOptions: [],
}

export const SapphireReview: Story = {
  render: () => (
    <StoryFrame>
      <PopulatedFields />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame>
      <div className='space-y-6'>
        <CandidateSelect
          addType='review'
          selectedCandidateId=''
          setSelectedCandidateId={() => {}}
          options={emptyOptions}
        />
        <TopicSelect
          selectedTopicId=''
          setSelectedTopicId={() => {}}
          topicOptions={emptyOptions.topicOptions}
        />
        <TopicGroupOptions
          options={emptyOptions}
          selectedGroupReviewIds={[]}
          selectedGroupReferralIds={[]}
          setSelectedGroupReviewIds={() => {}}
          setSelectedGroupReferralIds={() => {}}
        />
      </div>
    </StoryFrame>
  ),
}
