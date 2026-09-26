import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { LandingPageItemEditor } from '@/components/my/landing-pages-manager/item-picker'
import {
  useLandingPageItemOptions,
  type LandingPageAddType,
} from '@/components/my/landing-pages-manager/options'
import { StoryFrame } from '@/storybook/story-frame'
import { landingPageCandidates, landingPageWithItems } from '@/storybook/entities/fixtures/landing'
import { topics } from '@/storybook/entities/fixtures/topics'
import type { LandingPageItem } from '@/types/landing-pages'

const meta = {
  title: 'My/Landing Page Item Editor',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const sapphire = topics[1]!

function Editor({
  addType,
  draftItems,
}: {
  addType: LandingPageAddType
  draftItems: LandingPageItem[]
}) {
  const [type, setType] = useState(addType)
  const [candidateId, setCandidateId] = useState(landingPageCandidates.reviews[0]?.id ?? '')
  const [topicId, setTopicId] = useState(sapphire.id)
  const [reviewIds, setReviewIds] = useState<string[]>([])
  const [referralIds, setReferralIds] = useState<string[]>([])
  const [linkLabel, setLinkLabel] = useState(addType === 'link' ? '' : 'Award wallet')
  const [linkUrl, setLinkUrl] = useState(
    addType === 'link' ? '' : 'https://wallet.example/cardholder',
  )
  const options = useLandingPageItemOptions(landingPageCandidates, draftItems, topicId)
  return (
    <LandingPageItemEditor
      loading={false}
      addType={type}
      selectedCandidateId={candidateId}
      selectedTopicId={topicId}
      selectedGroupReviewIds={reviewIds}
      selectedGroupReferralIds={referralIds}
      options={options}
      linkLabel={linkLabel}
      linkUrl={linkUrl}
      onAddTypeChange={setType}
      setSelectedCandidateId={setCandidateId}
      setSelectedTopicId={setTopicId}
      setSelectedGroupReviewIds={setReviewIds}
      setSelectedGroupReferralIds={setReferralIds}
      setLinkLabel={setLinkLabel}
      setLinkUrl={setLinkUrl}
      onAddItem={() => {}}
      onSaveItems={() => {}}
      draftItems={draftItems}
      moveItem={() => {}}
      removeItem={() => {}}
      moveGroupEntry={() => {}}
      removeGroupEntry={() => {}}
    />
  )
}

export const WithItems: Story = {
  render: () => (
    <StoryFrame>
      <Editor
        addType='review'
        draftItems={landingPageWithItems.items}
      />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame>
      <Editor
        addType='link'
        draftItems={[]}
      />
    </StoryFrame>
  ),
}
