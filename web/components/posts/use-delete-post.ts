'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { deletePost } from '@/lib/api/client/posts'
import onError, { onSuccess } from '@/lib/on-error'

export function useDeletePost(postIdOrSlug: string) {
  const { push } = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    if (isDeleting) return
    setIsDeleting(true)
    try {
      await deletePost(postIdOrSlug)
      onSuccess('Post deleted')
      push('/')
    } catch (error) {
      /* c8 ignore next 3 -- error path requires injecting a delete failure */
      onError(error, {
        fallback: 'Failed to delete post. Please try again.',
        tags: { form: 'post-delete' },
      })
      setIsDeleting(false)
    }
  }

  return { isDeleting, handleDelete }
}
