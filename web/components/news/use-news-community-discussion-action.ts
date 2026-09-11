'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useRecaptchaToken } from '@/hooks/use-recaptcha-token'
import { useTurnstileToken } from '@/hooks/use-turnstile-token'
import { communityPendingPostsHref } from '@/lib/links/entity-href'
import { ApiError } from '@/lib/api/error'
import onError from '@/lib/on-error'
import { getCanonicalPostPath } from '@/lib/post-helpers'
import { useTranslations } from '@/lib/i18n/use-translations'
import {
  createLinkedCommunityDiscussion,
  loadAvailableCommunities,
} from './news-community-discussion-helpers'
import type {
  NewsCommunityDiscussionTarget,
  NewsCommunityDiscussionUrl,
} from './community-discussion-types'
import {
  isEmailVerificationRequired,
  useEmailVerificationRecovery,
} from '@/lib/email-verification-recovery-context'

export interface UseNewsCommunityDiscussionActionProps {
  fixedCommunity?: NewsCommunityDiscussionTarget
  itemTitle?: string | null
  relatedUrls: NewsCommunityDiscussionUrl[]
}

export function useNewsCommunityDiscussionAction({
  fixedCommunity,
  itemTitle,
  relatedUrls,
}: UseNewsCommunityDiscussionActionProps) {
  const t = useTranslations()
  const { push } = useRouter()
  const [open, setOpen] = useState(false)
  const [communities, setCommunities] = useState<NewsCommunityDiscussionTarget[]>(
    fixedCommunity ? [fixedCommunity] : [],
  )
  const [hasLoadedCommunities, setHasLoadedCommunities] = useState(Boolean(fixedCommunity))
  const [communitySlug, setCommunitySlug] = useState(fixedCommunity?.slug ?? '')
  const [isLoadingCommunities, setIsLoadingCommunities] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [usernameDialogOpen, setUsernameDialogOpen] = useState(false)
  const turnstile = useTurnstileToken()
  const recaptcha = useRecaptchaToken()
  const emailRecovery = useEmailVerificationRecovery()

  async function loadCommunities() {
    if (fixedCommunity || hasLoadedCommunities || isLoadingCommunities) return
    setIsLoadingCommunities(true)
    let hasAvailableCommunities = communities.length > 0
    const showAvailableCommunities = (available: NewsCommunityDiscussionTarget[]) => {
      hasAvailableCommunities = available.length > 0
      setCommunities(available)
      setCommunitySlug(current =>
        current && available.some(community => community.slug === current)
          ? current
          : available[0]?.slug || '',
      )
    }

    try {
      const available = await loadAvailableCommunities(showAvailableCommunities)
      showAvailableCommunities(available)
      setHasLoadedCommunities(true)
    } catch {
      onError(null, {
        fallback: hasAvailableCommunities
          ? 'Could not load every community.'
          : 'Could not load your communities.',
        skipSentry: true,
      })
    } finally {
      setIsLoadingCommunities(false)
    }
  }

  async function submit() {
    if (!communitySlug || isSubmitting) return
    const selectedCommunity = communities.find(community => community.slug === communitySlug)
    if (!selectedCommunity) return
    const isPrivateCommunity = selectedCommunity.visibility === 'private'
    setIsSubmitting(true)
    try {
      const recaptchaToken = await recaptcha.execute('create_post')
      const response = await createLinkedCommunityDiscussion(selectedCommunity, relatedUrls, {
        isPrivateCommunity,
        itemTitle,
        recaptchaToken,
        turnstileToken: turnstile.token,
      })
      setOpen(false)
      const requiresCommunityReview =
        response.communityPostReview?.approved_at === null &&
        response.communityPostReview.rejected_at === null &&
        response.communityPostReview.unpublished_at === null
      push(
        selectedCommunity.post_approval_required_at || requiresCommunityReview
          ? communityPendingPostsHref({ slug: communitySlug })
          : getCanonicalPostPath(response.post),
      )
    } catch (error) {
      if (isEmailVerificationRequired(error)) {
        setIsSubmitting(false)
        emailRecovery?.openEmailVerificationRecovery()
        return
      }
      if (error instanceof ApiError && error.code === 'IDENTITY_REQUIRED') {
        setOpen(false)
        setUsernameDialogOpen(true)
        setIsSubmitting(false)
        return
      }
      turnstile.reset()
      onError(error, {
        fallback: t(
          'extracted.news.newsCommunityDiscussionAction.couldNotStartDiscussion_6132b3d7',
        ),
      })
      setIsSubmitting(false)
    }
  }

  function openDialog() {
    setOpen(true)
    loadCommunities().catch(() => undefined)
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (nextOpen) loadCommunities().catch(() => undefined)
  }

  function handleUsernameSet() {
    setUsernameDialogOpen(false)
    void submit().catch(() => undefined)
  }

  function handleUsernameClose() {
    setUsernameDialogOpen(false)
    setIsSubmitting(false)
  }

  return {
    open,
    communities,
    hasLoadedCommunities,
    communitySlug,
    setCommunitySlug,
    isLoadingCommunities,
    isSubmitting,
    usernameDialogOpen,
    turnstile,
    openDialog,
    handleOpenChange,
    handleUsernameSet,
    handleUsernameClose,
    submit,
  }
}
