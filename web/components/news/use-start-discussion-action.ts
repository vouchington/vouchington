'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { getApiErrorMessage } from '@/lib/api/error-helpers'
import { ApiError } from '@/lib/api/error'
import { createLinkPost } from '@/lib/api/client/posts'
import { getPostSlugFromType } from '@/lib/route-configs'
import { getPostPath } from '@/lib/post-helpers'
import {
  isEmailVerificationRequired,
  useEmailVerificationRecovery,
} from '@/lib/email-verification-recovery-context'

export type StartDiscussionActionProps = { urlId: string }

export type StartDiscussionAction = ReturnType<typeof useStartDiscussionAction>

export function useStartDiscussionAction(props: StartDiscussionActionProps | null) {
  const router = useRouter()
  const [isCreating, setIsCreating] = useState(false)
  const [usernameDialogOpen, setUsernameDialogOpen] = useState(false)
  const emailRecovery = useEmailVerificationRecovery()

  async function handleStartDiscussion() {
    if (!props) return
    setIsCreating(true)
    try {
      const result = await createLinkPost({ url_id: props.urlId })
      const post = result.post
      router.push(getPostPath(getPostSlugFromType(post.post_type), post))
    } catch (error) {
      if (isEmailVerificationRequired(error)) {
        emailRecovery?.openEmailVerificationRecovery()
        setIsCreating(false)
        return
      }
      if (error instanceof ApiError && error.code === 'IDENTITY_REQUIRED') {
        setUsernameDialogOpen(true)
        setIsCreating(false)
        return
      }
      toast.error(getApiErrorMessage(error, 'Failed to create link post'))
      setIsCreating(false)
    }
  }

  function handleUsernameSet() {
    setUsernameDialogOpen(false)
    void handleStartDiscussion()
  }

  function handleUsernameClose() {
    setUsernameDialogOpen(false)
    setIsCreating(false)
  }

  return {
    handleStartDiscussion,
    isCreating,
    usernameDialogOpen,
    handleUsernameSet,
    handleUsernameClose,
  }
}
