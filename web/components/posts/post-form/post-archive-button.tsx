'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { archivePost, unarchivePost } from '@/lib/api/client/posts'

interface PostArchiveButtonProps {
  postIdOrSlug: string
  archivedAt: string | null
}

export function PostArchiveButton({ postIdOrSlug, archivedAt }: PostArchiveButtonProps) {
  const { refresh } = useRouter()
  const archiveKey = `${postIdOrSlug}:${archivedAt ?? ''}`
  const [archiveState, setArchiveState] = useState(() => ({
    key: archiveKey,
    isArchived: archivedAt != null,
  }))
  const [isPending, setIsPending] = useState(false)
  const isArchived = archiveState.key === archiveKey ? archiveState.isArchived : archivedAt != null

  const handleToggle = async () => {
    if (isPending) return
    const next = !isArchived
    setArchiveState({ key: archiveKey, isArchived: next })
    setIsPending(true)

    try {
      const response = next ? await archivePost(postIdOrSlug) : await unarchivePost(postIdOrSlug)
      setArchiveState({ key: archiveKey, isArchived: response.post.archived_at != null })
      refresh()
    } catch {
      setArchiveState({ key: archiveKey, isArchived: !next })
      toast.error(
        next
          ? 'Failed to archive post. Please try again.'
          : 'Failed to unarchive post. Please try again.',
      )
    } finally {
      setIsPending(false)
    }
  }

  const label = isArchived ? 'Unarchive' : 'Archive'
  const tooltip = isArchived
    ? 'Restore this post to public listings'
    : 'Hide this post from public listings'

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type='button'
            variant='outline'
            size='touchSm'
            aria-pressed={isArchived}
            disabled={isPending}
            onClick={handleToggle}
            data-pw='post-archive-button'
          >
            {label}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
