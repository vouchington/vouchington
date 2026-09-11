'use client'

import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { usePostLockToggle } from './use-post-lock-toggle'

interface PostLockMenuItemProps {
  postIdOrSlug: string
  lockedAt: string | null | undefined
}

export function PostLockMenuItem({ postIdOrSlug, lockedAt }: PostLockMenuItemProps) {
  const { isLocked, isPending, label, tooltip, handleToggle } = usePostLockToggle({
    postIdOrSlug,
    lockedAt,
  })

  return (
    <DropdownMenuItem
      disabled={isPending}
      onSelect={() => {
        handleToggle().catch(() => undefined)
      }}
      aria-pressed={isLocked}
      title={tooltip}
      data-pw='post-detail-lock-button'
    >
      {label}
    </DropdownMenuItem>
  )
}
