'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { unpublishCommunityPost } from '@/lib/api/client/communities'
import { toast } from 'sonner'

export function useUnpublishFromCommunity({
  communityId,
  postId,
}: {
  communityId: string
  postId: string
}) {
  const { refresh } = useRouter()
  const [isUnpublishing, setIsUnpublishing] = useState(false)

  const handleUnpublish = async () => {
    if (isUnpublishing) return
    setIsUnpublishing(true)
    try {
      await unpublishCommunityPost(communityId, postId)
      refresh()
    } catch {
      toast.error('Failed to unpublish post. Please try again.')
    } finally {
      setIsUnpublishing(false)
    }
  }

  return { isUnpublishing, handleUnpublish }
}
