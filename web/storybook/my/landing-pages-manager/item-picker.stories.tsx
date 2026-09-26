import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { LandingPageItemEditor } from '@/components/my/landing-pages-manager/item-picker'
import {
  addFreeformLinkItem,
  addSingleLandingPageItem,
  addTopicGroupLandingPageItem,
} from '@/components/my/landing-pages-manager/controller-add-items'
import {
  moveDraftGroupEntry,
  moveDraftItem,
  removeDraftGroupEntry,
} from '@/components/my/landing-pages-manager/draft-item-actions'
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
  initialItems,
}: {
  addType: LandingPageAddType
  initialItems: LandingPageItem[]
}) {
  const [type, setType] = useState(addType)
  const [items, setItems] = useState(initialItems)
  const [candidateId, setCandidateId] = useState(landingPageCandidates.reviews[0]?.id ?? '')
  const [topicId, setTopicId] = useState(sapphire.id)
  const [reviewIds, setReviewIds] = useState<string[]>([])
  const [referralIds, setReferralIds] = useState<string[]>([])
  const [linkLabel, setLinkLabel] = useState(addType === 'link' ? '' : 'Award wallet')
  const [linkUrl, setLinkUrl] = useState(
    addType === 'link' ? '' : 'https://wallet.example/cardholder',
  )
  const options = useLandingPageItemOptions(landingPageCandidates, items, topicId)

  function addItem() {
    if (type === 'link') {
      const added = addFreeformLinkItem({ label: linkLabel, url: linkUrl, setDraftItems: setItems })
      if (added) {
        setLinkLabel('')
        setLinkUrl('')
      }
      return
    }
    if (type !== 'topic_group') {
      addSingleLandingPageItem({
        addType: type,
        candidates: landingPageCandidates,
        selectedCandidateId: candidateId,
        setDraftItems: setItems,
      })
      setCandidateId('')
      return
    }
    addTopicGroupLandingPageItem({
      candidates: landingPageCandidates,
      itemOptions: options,
      onAdded: () => {
        setTopicId('')
        setReviewIds([])
        setReferralIds([])
      },
      selectedGroupReferralIds: referralIds,
      selectedGroupReviewIds: reviewIds,
      selectedTopicId: topicId,
      setDraftItems: setItems,
    })
  }

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
      onAddItem={addItem}
      onSaveItems={() => {}}
      draftItems={items}
      moveItem={(index, direction) => setItems(prev => moveDraftItem(prev, index, direction))}
      removeItem={index => setItems(prev => prev.filter((_, itemIndex) => itemIndex !== index))}
      moveGroupEntry={(itemIndex, entryIndex, direction) =>
        setItems(prev => moveDraftGroupEntry(prev, itemIndex, entryIndex, direction))
      }
      removeGroupEntry={(itemIndex, entryIndex) =>
        setItems(prev => removeDraftGroupEntry(prev, itemIndex, entryIndex))
      }
    />
  )
}

export const WithItems: Story = {
  render: () => (
    <StoryFrame>
      <Editor
        addType='review'
        initialItems={landingPageWithItems.items}
      />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame>
      <Editor
        addType='link'
        initialItems={[]}
      />
    </StoryFrame>
  ),
}
