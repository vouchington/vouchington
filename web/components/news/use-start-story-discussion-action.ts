'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { getApiErrorMessage, hasErrorCode } from '@/lib/api/error-helpers'
import { ApiError } from '@/lib/api/error'
import { createStoryPostFromStory } from '@/lib/api/client/stories'
import { createLinkPost } from '@/lib/api/client/posts'
import { getPostSlugFromType } from '@/lib/route-configs'
import { getPostPath } from '@/lib/post-helpers'
import type { Post } from '@/types/posts'
import {
  isEmailVerificationRequired,
  useEmailVerificationRecovery,
} from '@/lib/email-verification-recovery-context'

export interface StartStoryDiscussionProps {
  storyId: string
  fallbackUrlId: string
  onCreated?: (href: string) => void
}

export function useStartStoryDiscussionAction(props: StartStoryDiscussionProps | null) {
  const router = useRouter()
  const [isCreating, setIsCreating] = useState(false)
  const emailRecovery = useEmailVerificationRecovery()

  async function handleStartStoryDiscussion() {
    if (!props) return
    setIsCreating(true)
    try {
      const result = await createStoryPostFromStory(props.storyId)
      publishCreatedPost(result.post)
    } catch (error) {
      if (hasErrorCode(error, 'FEED_NOT_DISCOVERABLE')) {
        try {
          const linkResult = await createLinkPost({ url_id: props.fallbackUrlId })
          publishCreatedPost(linkResult.post)
          return
        } catch (linkError) {
          if (isEmailVerificationRequired(linkError)) {
            emailRecovery?.openEmailVerificationRecovery()
          } else {
            toast.error(getApiErrorMessage(linkError, 'Failed to create discussion'))
          }
        }
      } else if (error instanceof ApiError && error.status === 409) {
        router.refresh()
      } else {
        toast.error(getApiErrorMessage(error, 'Failed to create story discussion'))
      }
      setIsCreating(false)
    }
  }

  function publishCreatedPost(post: Post) {
    const href = getPostPath(getPostSlugFromType(post.post_type), post)
    props?.onCreated?.(href)
    router.push(href)
  }

  return { handleStartStoryDiscussion, isCreating }
}
