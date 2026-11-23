'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { deletePost } from '@/lib/api/client/post-mutations'
import onError, { onSuccess } from '@/lib/on-error'

export function useDeletePost(postIdOrSlug: string, onDeleted?: () => void) {
  const { push } = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    if (isDeleting) return
    setIsDeleting(true)
    try {
      await deletePost(postIdOrSlug)
      onSuccess('Post deleted')
      onDeleted?.()
      push('/')
    } catch (err) {
      /* c8 ignore next 3 -- error path requires injecting a delete failure */
      onError(err, {
        fallback: 'Failed to delete post. Please try again.',
        tags: { form: 'post-delete' },
      })
      // oxlint-disable-next-line react-doctor/no-loading-flag-reset-outside-finally -- stays disabled after success while navigation completes to block a double submit; only failure paths reset it
      setIsDeleting(false)
    }
  }

  return { isDeleting, handleDelete }
}
