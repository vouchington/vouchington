'use client'

import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { PublicUser } from '@/types/user'
import { useTranslations } from '@/lib/i18n/use-translations'

interface FollowerSendSelectedBadgesProps {
  followers: PublicUser[]
  onToggleFollowerSelection: (follower: PublicUser) => void
}

export function FollowerSendSelectedBadges({
  followers,
  onToggleFollowerSelection,
}: FollowerSendSelectedBadgesProps) {
  const t = useTranslations()
  return (
    <div className='flex flex-wrap gap-2'>
      {followers.map(follower => {
        const name = follower.username ?? follower.display_account?.name ?? follower.id
        return (
          <Badge
            key={follower.id}
            variant='secondary'
            className='gap-1 pr-1'
          >
            @{name}
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='h-5 w-5 rounded-full'
              onClick={() => onToggleFollowerSelection(follower)}
              aria-label={t('extracted.shared.followerSendSelectedBadges.removeName_e6a3c4a1', {
                name,
              })}
            >
              <X className='h-3 w-3' />
            </Button>
          </Badge>
        )
      })}
    </div>
  )
}
