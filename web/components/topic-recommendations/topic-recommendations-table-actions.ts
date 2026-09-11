'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  approveTopicRecommendation,
  rejectTopicRecommendation,
  updateTopicRecommendation,
  withdrawTopicRecommendation,
} from '@/lib/api/client/topic-recommendations'
import { topicHref } from '@/lib/links/entity-href'
import onError, { onSuccess } from '@/lib/on-error'
import {
  buildEditableState,
  buildTopicRecommendationUpdatePayload,
  editableStateMatchesPost,
  type EditableState,
  type TopicRecommendationEditablePostWithId,
} from './topic-recommendation-editable-state'
import type { TopicRecommendationTablePost } from './topic-recommendations-table'

export function useTopicRecommendationActions(orderedPostIds: string[]) {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedIdRef = useRef<string | null>(null)
  const [editableState, setEditableState] = useState<EditableState | null>(null)
  const [withdrawnIds, setWithdrawnIds] = useState<Set<string>>(() => new Set())
  const [isSaving, setIsSaving] = useState(false)
  const quickSavingIdsRef = useRef(new Set<string>())

  function navigateToId(posts: Record<string, TopicRecommendationTablePost>, id: string) {
    const post = posts[id]
    if (!post) return
    selectedIdRef.current = id
    setSelectedId(id)
    setEditableState(buildEditableState(post))
  }

  function openDialog(post: TopicRecommendationTablePost) {
    selectedIdRef.current = post.id
    setSelectedId(post.id)
    setEditableState(buildEditableState(post))
  }

  function closeDialog() {
    selectedIdRef.current = null
    setSelectedId(null)
    setEditableState(null)
  }

  function navigateToNextOrClose(
    posts: Record<string, TopicRecommendationTablePost>,
    currentId: string,
  ) {
    if (selectedIdRef.current !== currentId) return
    const idx = orderedPostIds.indexOf(currentId)
    const nextId =
      idx !== -1
        ? (orderedPostIds
            .slice(idx + 1)
            .find(id => posts[id]?.topic_recommendation?.status === 'pending') ?? null)
        : null
    if (nextId) {
      const nextPost = posts[nextId]
      selectedIdRef.current = nextId
      setSelectedId(nextId)
      if (nextPost) setEditableState(buildEditableState(nextPost))
    } else {
      closeDialog()
    }
  }

  async function persistChanges(post: TopicRecommendationEditablePostWithId, state: EditableState) {
    setIsSaving(true)
    try {
      await updateTopicRecommendation(post.id, buildTopicRecommendationUpdatePayload(state))
      onSuccess('Recommendation updated')
      router.refresh()
    } catch (error) {
      onError(error, { fallback: 'Failed to update recommendation' })
    } finally {
      setIsSaving(false)
    }
  }

  async function handleApprove(post: TopicRecommendationEditablePostWithId, state: EditableState) {
    setIsSaving(true)
    try {
      if (!editableStateMatchesPost(post, state)) {
        await updateTopicRecommendation(post.id, buildTopicRecommendationUpdatePayload(state))
      }
      const result = await approveTopicRecommendation(post.id)
      onSuccess('Recommendation approved')
      closeDialog()
      router.push(
        topicHref({
          topic_type: result.topic_type ?? 'topic',
          id: result.topic_id,
          slug: result.topic_slug,
        }),
      )
      router.refresh()
    } catch (error) {
      onError(error, { fallback: 'Failed to approve recommendation' })
    } finally {
      setIsSaving(false)
    }
  }

  async function handleReject(
    posts: Record<string, TopicRecommendationTablePost>,
    post: TopicRecommendationEditablePostWithId,
    state: EditableState,
  ) {
    setIsSaving(true)
    try {
      await rejectTopicRecommendation(post.id, state.rejection_reason || undefined)
      onSuccess('Recommendation rejected')
      navigateToNextOrClose(posts, post.id)
      router.refresh()
    } catch (error) {
      onError(error, { fallback: 'Failed to reject recommendation' })
    } finally {
      setIsSaving(false)
    }
  }

  async function handleWithdraw(post: TopicRecommendationTablePost) {
    try {
      await withdrawTopicRecommendation(post.id)
      setWithdrawnIds(current => new Set(current).add(post.id))
      onSuccess('Recommendation withdrawn')
      router.refresh()
    } catch (error) {
      onError(error, { fallback: 'Failed to withdraw recommendation' })
    }
  }

  async function handleQuickApprove(post: TopicRecommendationTablePost) {
    if (quickSavingIdsRef.current.has(post.id)) return
    quickSavingIdsRef.current.add(post.id)
    try {
      await approveTopicRecommendation(post.id)
      onSuccess('Recommendation approved')
      router.refresh()
    } catch (error) {
      onError(error, { fallback: 'Failed to approve recommendation' })
    } finally {
      quickSavingIdsRef.current.delete(post.id)
    }
  }

  async function handleQuickReject(post: TopicRecommendationTablePost) {
    if (quickSavingIdsRef.current.has(post.id)) return
    quickSavingIdsRef.current.add(post.id)
    try {
      await rejectTopicRecommendation(post.id)
      onSuccess('Recommendation rejected')
      router.refresh()
    } catch (error) {
      onError(error, { fallback: 'Failed to reject recommendation' })
    } finally {
      quickSavingIdsRef.current.delete(post.id)
    }
  }

  return {
    selectedId,
    editableState,
    setEditableState,
    withdrawnIds,
    isSaving,
    navigateToId,
    openDialog,
    closeDialog,
    persistChanges,
    handleApprove,
    handleReject,
    handleWithdraw,
    handleQuickApprove,
    handleQuickReject,
  }
}
