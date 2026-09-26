'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface FollowButtonProps {
  entityType?: string
  entityId?: string
  isFollowing?: boolean
  inactiveLabel?: string
  activeLabel?: string
  onChange?: (isActive: boolean) => void
  'data-pw'?: string
}

export function FollowButton({
  isFollowing = false,
  inactiveLabel = 'Follow',
  activeLabel = 'Following',
  onChange,
  'data-pw': dataPw = 'follow-button',
}: FollowButtonProps) {
  const [active, setActive] = useState(isFollowing)

  return (
    <Button
      type='button'
      size='sm'
      data-pw={dataPw}
      aria-pressed={active}
      onClick={() => {
        const next = !active
        setActive(next)
        onChange?.(next)
      }}
    >
      {active ? activeLabel : inactiveLabel}
    </Button>
  )
}
