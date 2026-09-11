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
import {
  isEmailVerificationRequired,
  useEmailVerificationRecovery,
} from '@/lib/email-verification-recovery-context'

export interface StartStoryDiscussionProps {
  storyId: string
  fallbackUrlId: string
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
      router.push(getPostPath(getPostSlugFromType(result.post.post_type), result.post))
    } catch (error) {
      if (hasErrorCode(error, 'FEED_NOT_DISCOVERABLE')) {
        try {
          const linkResult = await createLinkPost({ url_id: props.fallbackUrlId })
          router.push(getPostPath(getPostSlugFromType(linkResult.post.post_type), linkResult.post))
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

  return { handleStartStoryDiscussion, isCreating }
}
