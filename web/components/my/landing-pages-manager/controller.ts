import { useState } from 'react'
import { toast } from 'sonner'
import { replaceMyLandingPageItems } from '@/lib/api/client'
import type {
  LandingPage,
  LandingPageCandidates,
  LandingPageItem,
  LandingPageWithItems,
} from '@/types/landing-pages'
import {
  addFreeformLinkItem,
  addSingleLandingPageItem,
  addTopicGroupLandingPageItem,
} from './controller-add-items'
import { moveDraftGroupEntry, moveDraftItem, removeDraftGroupEntry } from './draft-item-actions'
import { withLoading } from './controller-helpers'
import { useLandingPagePageActions } from './controller-page-actions'
import {
  type LandingPageAddType,
  toLandingPageItemInput,
  useLandingPageItemOptions,
} from './options'
interface ControllerProps {
  initialPages: LandingPage[]
  initialSelectedPage: LandingPageWithItems | null
  candidates: LandingPageCandidates
}
export function useLandingPagesManagerController({
  initialPages,
  initialSelectedPage,
  candidates,
}: ControllerProps) {
  const [pages, setPages] = useState(initialPages)
  const [selectedPage, setSelectedPage] = useState<LandingPageWithItems | null>(initialSelectedPage)
  const [draftItems, setDraftItems] = useState<LandingPageItem[]>(initialSelectedPage?.items ?? [])
  const [loading, setLoading] = useState(false)
  const [title, setTitle] = useState(initialSelectedPage?.title ?? '')
  const [subtitle, setSubtitle] = useState(initialSelectedPage?.subtitle ?? '')
  const [slug, setSlug] = useState(initialSelectedPage?.slug ?? '')
  const [newTitle, setNewTitle] = useState('')
  const [newSubtitle, setNewSubtitle] = useState('')
  const [newSlug, setNewSlug] = useState('')
  const [addType, setAddType] = useState<LandingPageAddType>('link')
  const [selectedCandidateId, setSelectedCandidateId] = useState('')
  const [selectedTopicId, setSelectedTopicId] = useState('')
  const [selectedGroupReviewIds, setSelectedGroupReviewIds] = useState<string[]>([])
  const [selectedGroupReferralIds, setSelectedGroupReferralIds] = useState<string[]>([])
  const [linkLabel, setLinkLabel] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const itemOptions = useLandingPageItemOptions(candidates, draftItems, selectedTopicId)
  function setActivePage(page: LandingPageWithItems | null) {
    setSelectedPage(page)
    setDraftItems(page?.items ?? [])
    setTitle(page?.title ?? '')
    setSubtitle(page?.subtitle ?? '')
    setSlug(page?.slug ?? '')
  }
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
  const pageActions = useLandingPagePageActions({
    newSlug,
    newSubtitle,
    newTitle,
    pages,
    selectedPage,
    setActivePage,
    setLoading,
    setNewSlug,
    setNewSubtitle,
    setNewTitle,
    setPages,
    setSelectedPage,
    slug,
    subtitle,
    title,
  })
  function addItem() {
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
  async function saveItems() {
    if (!selectedPage) return
    await withLoading(
      setLoading,
      async () => {
        const { landing_page } = await replaceMyLandingPageItems(selectedPage.id, {
          items: draftItems.map(toLandingPageItemInput),
        })
        setSelectedPage(landing_page)
        setPages(prev => prev.map(page => (page.id === landing_page.id ? landing_page : page)))
        setDraftItems(landing_page.items)
        toast.success('Landing page content saved')
      },
      'Failed to save landing page content',
    )
  }
  return {
    pages,
    selectedPage,
    draftItems,
    loading,
    title,
    subtitle,
    slug,
    newTitle,
    newSubtitle,
    newSlug,
    addType,
    selectedCandidateId,
    selectedTopicId,
    selectedGroupReviewIds,
    selectedGroupReferralIds,
    itemOptions,
    handleCreatePage: pageActions.createPage,
    handleSaveDetails: pageActions.saveDetails,
    handleSelectPage: pageActions.selectPage,
    handleAddItem: addItem,
    handleSaveItems: saveItems,
    handleDeletePage: pageActions.deletePage,
    handleSetDefaultPage: pageActions.setDefaultPage,
    setTitle,
    setSubtitle,
    setSlug,
    setNewTitle,
    setNewSubtitle,
    setNewSlug,
    handleSetAddType,
    setSelectedCandidateId,
    setSelectedTopicId: handleSetSelectedTopicId,
    setSelectedGroupReviewIds,
    setSelectedGroupReferralIds,
    linkLabel,
    linkUrl,
    setLinkLabel,
    setLinkUrl,
    moveItem: (index: number, direction: -1 | 1) =>
      setDraftItems(prev => moveDraftItem(prev, index, direction)),
    removeItem: (index: number) =>
      setDraftItems(prev => prev.filter((_, itemIndex) => itemIndex !== index)),
    moveGroupEntry: (itemIndex: number, entryIndex: number, direction: -1 | 1) =>
      setDraftItems(prev => moveDraftGroupEntry(prev, itemIndex, entryIndex, direction)),
    removeGroupEntry: (itemIndex: number, entryIndex: number) =>
      setDraftItems(prev => removeDraftGroupEntry(prev, itemIndex, entryIndex)),
  }
}
