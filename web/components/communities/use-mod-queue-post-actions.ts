'use client'

import { startTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  claimCommunityPendingPost,
  deEscalateCommunityPendingPost,
  escalateCommunityPendingPost,
  openModInternalThreadForPost,
  releaseCommunityPendingPost,
} from '@/lib/api/client/mod-queue-actions'
import { messagesHref } from '@/lib/links/entity-href'
import { useTranslations } from '@/lib/i18n/use-translations'
import onError from '@/lib/on-error'

export function useModQueuePostActions({
  communitySlug,
  onClaimToggle,
  onEscalateToggle,
}: {
  communitySlug: string
  onClaimToggle?: (postId: string) => void
  onEscalateToggle?: (postId: string, escalated: boolean) => void
}) {
  const t = useTranslations()
  const router = useRouter()
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [escalatingId, setEscalatingId] = useState<string | null>(null)
  const [discussingId, setDiscussingId] = useState<string | null>(null)

  async function handleDiscuss(postId: string) {
    if (discussingId === postId) return
    setDiscussingId(postId)
    try {
      const { conversation } = await openModInternalThreadForPost(communitySlug, postId)
      router.push(messagesHref(conversation))
    } catch (err) {
      onError(err, {
        fallback: t(
          'extracted.communities.modQueuePosts.failedToOpenInternalDiscussionThread_3243e335',
        ),
        tags: { action: 'mod-internal-thread-post', communitySlug },
      })
    } finally {
      setDiscussingId(null)
    }
  }

  async function handleClaim(postId: string) {
    if (claimingId === postId) return
    setClaimingId(postId)
    try {
      await claimCommunityPendingPost(communitySlug, postId)
      onClaimToggle?.(postId)
      startTransition(() => {
        router.refresh()
      })
    } catch (err) {
      onError(err, {
        fallback: t('extracted.communities.modQueuePosts.failedToClaimPost_f3c642ce'),
        tags: { action: 'claim-post', communitySlug },
      })
    } finally {
      setClaimingId(null)
    }
  }

  async function handleRelease(postId: string) {
    if (claimingId === postId) return
    setClaimingId(postId)
    try {
      await releaseCommunityPendingPost(communitySlug, postId)
      onClaimToggle?.(postId)
      startTransition(() => {
        router.refresh()
      })
    } catch (err) {
      onError(err, {
        fallback: t('extracted.communities.modQueuePosts.failedToReleasePostClaim_7e3c06c4'),
        tags: { action: 'release-post', communitySlug },
      })
    } finally {
      setClaimingId(null)
    }
  }

  async function handleEscalate(postId: string) {
    if (escalatingId === postId) return
    setEscalatingId(postId)
    try {
      await escalateCommunityPendingPost(communitySlug, postId)
      onEscalateToggle?.(postId, true)
      startTransition(() => {
        router.refresh()
      })
    } catch (err) {
      onError(err, {
        fallback: t('extracted.communities.modQueuePosts.failedToEscalatePost_e4397974'),
        tags: { action: 'escalate-post', communitySlug },
      })
    } finally {
      setEscalatingId(null)
    }
  }

  async function handleDeEscalate(postId: string) {
    if (escalatingId === postId) return
    setEscalatingId(postId)
    try {
      await deEscalateCommunityPendingPost(communitySlug, postId)
      onEscalateToggle?.(postId, false)
      startTransition(() => {
        router.refresh()
      })
    } catch (err) {
      onError(err, {
        fallback: t('extracted.communities.modQueuePosts.failedToRemovePostEscalation_98077301'),
        tags: { action: 'de-escalate-post', communitySlug },
      })
    } finally {
      setEscalatingId(null)
    }
  }

  return {
    claimingId,
    discussingId,
    escalatingId,
    handleClaim,
    handleDeEscalate,
    handleDiscuss,
    handleEscalate,
    handleRelease,
  }
}

export type ModQueuePostActions = ReturnType<typeof useModQueuePostActions>
