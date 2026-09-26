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

  const handleUnpublish = async (): Promise<boolean> => {
    if (isUnpublishing) return false
    setIsUnpublishing(true)
    try {
      await unpublishCommunityPost(communityId, postId)
      refresh()
      return true
    } catch {
      toast.error('Failed to unpublish post. Please try again.')
      return false
    } finally {
      setIsUnpublishing(false)
    }
  }

  return { isUnpublishing, handleUnpublish }
}
