'use client'

import { useState } from 'react'
import { useCandidatePages } from './landing-pages-manager/use-candidate-pages'
import type { LandingPageCandidatesResponseBody } from '@/types/api-responses'
import { useRouter } from 'next/navigation'
import {
  type LandingPageAddType,
  useLandingPageItemOptions,
} from '@/components/my/landing-pages-manager/options'
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
  deleteLandingPageEditorPage,
  persistDefaultLandingPage,
  persistLandingPageDetails,
  persistLandingPageItems,
} from './landing-page-editor-persistence'
import type { LandingPageItem, LandingPageWithItems } from '@/types/landing-pages'

export function useLandingPageEditorController(
  initialPage: LandingPageWithItems,
  initialCandidates: LandingPageCandidatesResponseBody,
) {
  const router = useRouter()
  const candidatePages = useCandidatePages(initialCandidates)
  const candidates = candidatePages.data.candidates
  const [page, setPage] = useState(initialPage)
  const [draftItems, setDraftItems] = useState<LandingPageItem[]>(initialPage.items)
  const [loading, setLoading] = useState(false)
  const [title, setTitle] = useState(initialPage.title)
  const [subtitle, setSubtitle] = useState(initialPage.subtitle ?? '')
  const [slug, setSlug] = useState(initialPage.slug)
  const [addType, setAddType] = useState<LandingPageAddType>('link')
  const [selectedCandidateId, setSelectedCandidateId] = useState('')
  const [selectedTopicId, setSelectedTopicId] = useState('')
  const [selectedGroupReviewIds, setSelectedGroupReviewIds] = useState<string[]>([])
  const [selectedGroupReferralIds, setSelectedGroupReferralIds] = useState<string[]>([])
  const [linkLabel, setLinkLabel] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const itemOptions = useLandingPageItemOptions(candidates, draftItems, selectedTopicId)

  function handleSetAddType(value: LandingPageAddType) {
    setAddType(value)
    setSelectedCandidateId('')
    setSelectedTopicId('')
    setSelectedGroupReviewIds([])
    setSelectedGroupReferralIds([])
  }

  function handleSetSelectedTopicId(value: string) {
    setSelectedTopicId(value)
    setSelectedGroupReviewIds([])
    setSelectedGroupReferralIds([])
  }
  const itemLimit = candidatePages.data.item_limit
  const itemCount = draftItems.reduce(
    (count, item) => count + 1 + (item.type === 'topic_group' ? item.entries.length : 0),
    0,
  )
  const addedCount =
    addType === 'topic_group'
      ? 1 + selectedGroupReviewIds.length + selectedGroupReferralIds.length
      : 1
  function addItem() {
    if (itemCount + addedCount > itemLimit) return
    if (addType === 'link') {
      const added = addFreeformLinkItem({ label: linkLabel, url: linkUrl, setDraftItems })
      if (added) {
        setLinkLabel('')
        setLinkUrl('')
      }
      return
    }
    if (addType !== 'topic_group') {
      addSingleLandingPageItem({ addType, candidates, selectedCandidateId, setDraftItems })
      setSelectedCandidateId('')
      return
    }
    addTopicGroupLandingPageItem({
      candidates,
      itemOptions,
      onAdded: () => {
        setSelectedTopicId('')
        setSelectedGroupReviewIds([])
        setSelectedGroupReferralIds([])
      },
      selectedTopicId,
      selectedGroupReviewIds,
      selectedGroupReferralIds,
      setDraftItems,
    })
  }

  async function handleSaveDetails(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading) return
    setLoading(true)
    await persistLandingPageDetails({ page, title, subtitle, slug, setPage, router })
    setLoading(false)
  }

  async function handleSaveItems() {
    if (loading) return
    setLoading(true)
    await persistLandingPageItems({
      pageId: page.id,
      draftItems,
      setPage,
      setDraftItems,
      setItemLimit: candidatePages.setItemLimit,
    })
    setLoading(false)
  }

  async function handleSetDefault() {
    if (loading) return
    setLoading(true)
    await persistDefaultLandingPage({ pageId: page.id, setPage })
    setLoading(false)
  }

  async function handleDelete() {
    if (loading) return
    setLoading(true)
    await deleteLandingPageEditorPage({ pageId: page.id, router, setLoading })
  }

  return {
    page,
    draftItems,
    loading,
    title,
    subtitle,
    slug,
    addType,
    selectedCandidateId,
    selectedTopicId,
    selectedGroupReviewIds,
    selectedGroupReferralIds,
    linkLabel,
    linkUrl,
    itemOptions,
    itemLimit,
    hasNextPage: candidatePages.data.page_info.has_next_page,
    loadingCandidates: candidatePages.loading,
    candidatesError: candidatePages.error,
    handleLoadMoreCandidates: candidatePages.loadMore,
    setTitle,
    setSubtitle,
    setSlug,
    setSelectedCandidateId,
    setSelectedTopicId: handleSetSelectedTopicId,
    setSelectedGroupReviewIds,
    setSelectedGroupReferralIds,
    setLinkLabel,
    setLinkUrl,
    handleSetAddType,
    handleAddItem: addItem,
    handleSaveDetails,
    handleSaveItems,
    handleSetDefault,
    handleDelete,
    moveItem: (index: number, direction: -1 | 1) =>
      setDraftItems(prev => moveDraftItem(prev, index, direction)),
    removeItem: (index: number) => setDraftItems(prev => prev.filter((_, i) => i !== index)),
    moveGroupEntry: (itemIndex: number, entryIndex: number, direction: -1 | 1) =>
      setDraftItems(prev => moveDraftGroupEntry(prev, itemIndex, entryIndex, direction)),
    removeGroupEntry: (itemIndex: number, entryIndex: number) =>
      setDraftItems(prev => removeDraftGroupEntry(prev, itemIndex, entryIndex)),
  }
}
