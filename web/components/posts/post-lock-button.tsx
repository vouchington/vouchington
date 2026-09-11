'use client'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { usePostLockToggle } from './use-post-lock-toggle'

interface PostLockButtonProps {
  postIdOrSlug: string
  lockedAt: string | null | undefined
}

export function PostLockButton({ postIdOrSlug, lockedAt }: PostLockButtonProps) {
  const { isLocked, isPending, label, tooltip, handleToggle } = usePostLockToggle({
    postIdOrSlug,
    lockedAt,
  })

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type='button'
            variant='outline'
            size='touchSm'
            aria-pressed={isLocked}
            disabled={isPending}
            onClick={handleToggle}
          >
            {label}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
