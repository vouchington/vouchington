import type { Dispatch, SetStateAction } from 'react'
import type { LandingPageCandidates, LandingPageItem } from '@/types/landing-pages'
import { isHttpUrlWithoutFragment } from '@/lib/url/valid-url'
import { buildTopicGroupEntries } from './controller-helpers'
import type { LandingPageAddType, LandingPageItemOptions } from './options'

interface AddFreeformLinkItemParams {
  label: string
  url: string
  setDraftItems: Dispatch<SetStateAction<LandingPageItem[]>>
}

export function addFreeformLinkItem({ label, url, setDraftItems }: AddFreeformLinkItemParams) {
  const trimmedLabel = label.trim()
  const trimmedUrl = url.trim()
  if (!trimmedLabel || !isHttpUrlWithoutFragment(trimmedUrl)) return false
  setDraftItems(prev => [
    ...prev,
    { id: crypto.randomUUID(), type: 'link', label: trimmedLabel, url: trimmedUrl },
  ])
  return true
}

interface AddSingleLandingPageItemParams {
  addType: LandingPageAddType
  candidates: LandingPageCandidates
  selectedCandidateId: string
  setDraftItems: Dispatch<SetStateAction<LandingPageItem[]>>
}

export function addSingleLandingPageItem({
  addType,
  candidates,
  selectedCandidateId,
  setDraftItems,
}: AddSingleLandingPageItemParams) {
  if (!selectedCandidateId) return
  if (addType === 'profile_link') {
    const profileLink = candidates.profile_links.find(link => link.id === selectedCandidateId)
    if (profileLink)
      setDraftItems(prev => [
        ...prev,
        { id: crypto.randomUUID(), type: 'profile_link', profile_link: profileLink },
      ])
  } else if (addType === 'review') {
    const review = candidates.reviews.find(candidate => candidate.id === selectedCandidateId)
    if (review)
      setDraftItems(prev => [...prev, { id: crypto.randomUUID(), type: 'review', review }])
  } else {
    const referralLink = candidates.referral_links.find(link => link.id === selectedCandidateId)
    if (referralLink)
      setDraftItems(prev => [
        ...prev,
        { id: crypto.randomUUID(), type: 'referral_link', referral_link: referralLink },
      ])
  }
}

interface AddTopicGroupLandingPageItemParams {
  candidates: LandingPageCandidates
  itemOptions: LandingPageItemOptions
  onAdded: () => void
  selectedGroupReferralIds: string[]
  selectedGroupReviewIds: string[]
  selectedTopicId: string
  setDraftItems: Dispatch<SetStateAction<LandingPageItem[]>>
}

export function addTopicGroupLandingPageItem({
  candidates,
  itemOptions,
  onAdded,
  selectedGroupReferralIds,
  selectedGroupReviewIds,
  selectedTopicId,
  setDraftItems,
}: AddTopicGroupLandingPageItemParams) {
  if (!selectedTopicId) return
  const entries = buildTopicGroupEntries(
    candidates,
    selectedGroupReviewIds,
    selectedGroupReferralIds,
  )
  const topic = itemOptions.topicOptions.find(option => option.id === selectedTopicId)
  if (!topic || entries.length === 0) return
  setDraftItems(prev => [...prev, { id: crypto.randomUUID(), type: 'topic_group', topic, entries }])
  onAdded()
}
