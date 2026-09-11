'use client'
/* oxlint-disable max-lines -- landing page editor controller keeps detail, item, and ordering handlers colocated for shared draft state */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  deleteMyLandingPage,
  replaceMyLandingPageItems,
  setDefaultMyLandingPage,
  updateMyLandingPage,
} from '@/lib/api/client'
import onError, { onSuccess } from '@/lib/on-error'
import {
  type LandingPageAddType,
  toLandingPageItemInput,
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
import { myLandingPageHref } from '@/lib/links/entity-href'
import type {
  LandingPageCandidates,
  LandingPageItem,
  LandingPageWithItems,
} from '@/types/landing-pages'

export function useLandingPageEditorController(
  initialPage: LandingPageWithItems,
  candidates: LandingPageCandidates,
) {
  const router = useRouter()
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

  async function handleSaveDetails(event: React.FormEvent) {
    event.preventDefault()
    if (loading) return
    setLoading(true)
    try {
      const { landing_page } = await updateMyLandingPage(page.id, {
        title,
        subtitle: subtitle || null,
        slug,
      })
      const previousSlug = page.slug
      setPage(prev => ({ ...prev, ...landing_page }))
      onSuccess('Page details saved')
      if (landing_page.slug !== previousSlug) {
        router.replace(myLandingPageHref(landing_page))
      }
    } catch (error) {
      /* c8 ignore next -- error path requires injecting a save page details failure */
      onError(error, { fallback: 'Failed to save page details' })
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveItems() {
    if (loading) return
    setLoading(true)
    try {
      const { landing_page } = await replaceMyLandingPageItems(page.id, {
        items: draftItems.map(toLandingPageItemInput),
      })
      setPage(landing_page)
      setDraftItems(landing_page.items)
      onSuccess('Landing page content saved')
    } catch (error) {
      /* c8 ignore next -- error path requires injecting a save landing page content failure */
      onError(error, { fallback: 'Failed to save landing page content' })
    } finally {
      setLoading(false)
    }
  }

  async function handleSetDefault() {
    if (loading) return
    setLoading(true)
    try {
      const { landing_page } = await setDefaultMyLandingPage(page.id)
      setPage(prev => ({ ...prev, is_default: landing_page.is_default }))
      onSuccess('Default landing page updated')
    } catch (error) {
      /* c8 ignore next -- error path requires injecting a set default landing page failure */
      onError(error, { fallback: 'Failed to set default landing page' })
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (loading) return
    setLoading(true)
    try {
      await deleteMyLandingPage(page.id)
      onSuccess('Landing page deleted')
      router.push('/my/landing-pages')
    } catch (error) {
      /* c8 ignore next 2 -- error path requires injecting a delete landing page failure */
      onError(error, { fallback: 'Failed to delete landing page' })
      setLoading(false)
    }
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
