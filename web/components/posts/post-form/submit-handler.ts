import { useState } from 'react'
import { ApiError } from '@/lib/api/error'
import onError, { onSuccess } from '@/lib/on-error'
import { communityPendingPostsHref } from '@/lib/links/entity-href'
import { getCanonicalPostPath } from '@/lib/post-helpers'
import { PostSavedWithRatingError, submitPost, type SubmitPostInput } from './submission'
import {
  isEmailVerificationRequired,
  useEmailVerificationRecovery,
} from '@/lib/email-verification-recovery-context'

export function usePostFormSubmit({
  communityPendingRedirectPath,
  communitySlug,
  isEdit,
  router,
  submitInput,
  onCaptchaConsumed,
  onSubmitted,
}: {
  communityPendingRedirectPath?: string
  communitySlug?: string
  isEdit: boolean
  router: { push: (href: string) => void }
  submitInput: () => SubmitPostInput
  /**
   * Called when a terminal submit failure has consumed the Turnstile token, so the
   * caller can reset the widget and mint a fresh one. Not called for the
   * username-required retry path, where the backend rejects before verifying.
   */
  onCaptchaConsumed?: () => void
  onSubmitted?: (href: string) => void
}) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [usernameDialogOpen, setUsernameDialogOpen] = useState(false)
  const emailRecovery = useEmailVerificationRecovery()

  const handleSubmitPost = async () => {
    setIsSubmitting(true)
    let shouldResetSubmitting = true
    try {
      const saved = await submitPost(submitInput())
      shouldResetSubmitting = false
      onSuccess(isEdit ? 'Post updated' : 'Post created')
      const pendingRedirectPath =
        communityPendingRedirectPath ??
        (communitySlug ? communityPendingPostsHref({ slug: communitySlug }) : undefined)
      const requiresCommunityReview =
        saved.communityPostReview?.approved_at === null &&
        saved.communityPostReview.rejected_at === null &&
        saved.communityPostReview.unpublished_at === null
      const href =
        !isEdit &&
        communitySlug &&
        pendingRedirectPath &&
        (communityPendingRedirectPath || requiresCommunityReview)
          ? pendingRedirectPath
          : getCanonicalPostPath(saved.post)
      onSubmitted?.(href)
      router.push(href)
    } catch (error) {
      shouldResetSubmitting = handleSubmitError(error, router)
    } finally {
      if (shouldResetSubmitting) setIsSubmitting(false)
    }
  }

  function handleSubmitError(err: unknown, route: typeof router): boolean {
    if (
      isEmailVerificationRequired(err) ||
      (err instanceof PostSavedWithRatingError && isEmailVerificationRequired(err.cause))
    ) {
      emailRecovery?.openEmailVerificationRecovery()
      return true
    }
    if (err instanceof PostSavedWithRatingError) {
      // Pass the wrapper error (not err.cause) so onError uses the fallback message,
      // preserving the "post saved, ratings failed" context users need to see.
      onError(err, {
        fallback:
          err.cause instanceof ApiError
            ? `Post saved, but some ratings failed: ${err.cause.message}. Please retry.`
            : 'Post saved, but some rating changes may not have saved. Please retry.',
        tags: { form: 'post-submit' },
        skipSentry: true,
      })
      route.push(getCanonicalPostPath(err.saved))
      return false
    }
    if (err instanceof ApiError && err.code === 'IDENTITY_REQUIRED') {
      setUsernameDialogOpen(true)
      return false
    }
    onError(err, { fallback: 'An unexpected error occurred.', tags: { form: 'post-submit' } })
    onCaptchaConsumed?.()
    return true
  }

  const handleUsernameSet = async () => {
    setUsernameDialogOpen(false)
    await handleSubmitPost()
  }

  const handleUsernameClose = () => {
    setUsernameDialogOpen(false)
    setIsSubmitting(false)
  }

  return {
    handleSubmitPost,
    handleUsernameClose,
    handleUsernameSet,
    isSubmitting,
    usernameDialogOpen,
  }
}
