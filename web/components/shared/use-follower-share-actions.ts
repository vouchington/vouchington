'use client'

import { useRef, useState } from 'react'
import { sharePostWithFollowers, sendPostToFollowers } from '@/lib/api/client/posts'
import {
  shareRssFeedItemWithFollowers,
  sendRssFeedItemToFollowers,
} from '@/lib/api/client/rss-feeds'
import type { PublicUser } from '@/types/user'
import onError, { onSuccess } from '@/lib/on-error'
import {
  toggleFollowerSelection as toggleSelection,
  type Audience,
} from './follower-share-actions-utils'
import type { FollowerDistributionSendBody } from '@/lib/api/client/follower-distributions'
import { useTranslations } from '@/lib/i18n/use-translations'

interface UseFollowerShareActionsOptions {
  entityType: 'post' | 'rss_feed_item'
  entityId: string
  currentUserId: string | null
}

export const useFollowerShareActions = ({
  entityType,
  entityId,
  currentUserId,
}: UseFollowerShareActionsOptions) => {
  const t = useTranslations()
  const [isSharePending, setIsSharePending] = useState(false)
  const [isSendPending, setIsSendPending] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [audience, setAudience] = useState<Audience>('all_followers')
  const [selectedFollowers, setSelectedFollowers] = useState<PublicUser[]>([])
  const contextKey = `${currentUserId ?? ''}\u0000${entityType}\u0000${entityId}`
  const [stateContextKey, setStateContextKey] = useState(contextKey)
  const selectedFollowersRef = useRef<PublicUser[]>([])
  const sharePendingRef = useRef(false)
  const sendPendingRef = useRef(false)
  const contextGenerationRef = useRef(0)

  if (stateContextKey !== contextKey) {
    contextGenerationRef.current += 1
    setStateContextKey(contextKey)
    sharePendingRef.current = false
    sendPendingRef.current = false
    setIsSharePending(false)
    setIsSendPending(false)
    setIsDialogOpen(false)
    setAudience('all_followers')
    selectedFollowersRef.current = []
    setSelectedFollowers([])
  }

  async function handleShare() {
    if (sharePendingRef.current) return
    const contextGeneration = contextGenerationRef.current
    sharePendingRef.current = true
    setIsSharePending(true)

    try {
      if (entityType === 'post') {
        await sharePostWithFollowers(entityId)
      } else {
        await shareRssFeedItemWithFollowers(entityId)
      }

      if (contextGeneration === contextGenerationRef.current) {
        onSuccess(t('extracted.shared.useFollowerShareActions.shareQueued_d32e8704'))
      }
    } catch (error) {
      if (contextGeneration === contextGenerationRef.current) {
        onError(error, {
          fallback: t(
            'extracted.shared.useFollowerShareActions.failedToShareWithFollowers_272673f8',
          ),
        })
      }
    } finally {
      if (contextGeneration === contextGenerationRef.current) {
        sharePendingRef.current = false
        setIsSharePending(false)
      }
    }
  }

  async function handleSend() {
    if (sendPendingRef.current) return
    if (audience === 'selected_followers' && selectedFollowers.length === 0) {
      const message = t(
        'extracted.shared.useFollowerShareActions.chooseAtLeastOneFollower_5cdae0cc',
      )
      onError(new Error(message), {
        fallback: message,
        skipSentry: true,
      })
      return
    }

    const contextGeneration = contextGenerationRef.current
    sendPendingRef.current = true
    setIsSendPending(true)

    try {
      const selectedFollowerIds = selectedFollowers.map(follower => follower.id)
      if (entityType === 'post') {
        await sendPostToFollowers(entityId, buildSendOptions(audience, selectedFollowerIds))
      } else {
        await sendRssFeedItemToFollowers(entityId, buildSendOptions(audience, selectedFollowerIds))
      }

      if (contextGeneration === contextGenerationRef.current) {
        onSuccess(t('extracted.shared.useFollowerShareActions.sendQueued_11badc4f'))
        resetDialogState(false)
      }
    } catch (error) {
      if (contextGeneration === contextGenerationRef.current) {
        onError(error, {
          fallback: t('extracted.shared.useFollowerShareActions.failedToSendToFollowers_6a759de3'),
        })
      }
    } finally {
      if (contextGeneration === contextGenerationRef.current) {
        sendPendingRef.current = false
        setIsSendPending(false)
      }
    }
  }

  function toggleFollowerSelection(follower: PublicUser) {
    const next = toggleSelection(selectedFollowersRef.current, follower)
    if (next === selectedFollowersRef.current) {
      const message = t('extracted.shared.useFollowerShareActions.youCanSelectUpTo100_ca2448f2')
      onError(new Error(message), {
        fallback: message,
        skipSentry: true,
      })
      return
    }
    selectedFollowersRef.current = next
    setSelectedFollowers(next)
  }

  function resetDialogState(open: boolean) {
    setIsDialogOpen(open)

    if (!open) {
      setAudience('all_followers')
      selectedFollowersRef.current = []
      setSelectedFollowers([])
    }
  }

  const handleAudienceChange = setAudience

  function handleSendDialogOpen() {
    resetDialogState(true)
  }

  return {
    audience,
    currentUserId,
    handleSend,
    handleSendDialogOpen,
    handleShare,
    isDialogOpen,
    isSendPending,
    isSharePending,
    resetDialogState,
    selectedFollowers,
    handleAudienceChange,
    toggleFollowerSelection,
  }
}

function buildSendOptions(
  audience: Audience,
  selectedFollowerIds: string[],
): FollowerDistributionSendBody {
  return audience === 'all_followers'
    ? { audience }
    : { audience, recipient_user_ids: selectedFollowerIds }
}
