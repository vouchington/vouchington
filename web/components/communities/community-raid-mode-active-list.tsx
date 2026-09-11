'use client'

import { ShieldOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CommunityRestriction } from '@/types/api-responses'
import { formatRestrictionExpiry, formatRestrictionType } from './community-raid-mode-state'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  restrictions: CommunityRestriction[]
  liftingId: string | null
  isBusy: boolean
  onLift: (restrictionId: string) => void
}

export function CommunityRaidModeActiveList({ restrictions, liftingId, isBusy, onLift }: Props) {
  const t = useTranslations()
  if (restrictions.length === 0) {
    return (
      <p
        className='text-sm text-muted-foreground'
        data-pw='community-raid-mode-empty'
      >
        {t('extracted.communities.communityRaidModeActiveList.noActiveRestrictions_a41fbbd5')}
      </p>
    )
  }

  return (
    <div className='space-y-2'>
      {restrictions.map(restriction => (
        <div
          key={restriction.id}
          className='flex flex-col gap-3 rounded-md border p-3 text-sm sm:flex-row sm:items-center sm:justify-between'
          data-pw='community-raid-mode-active-row'
        >
          <div>
            <p className='font-medium'>{formatRestrictionType(restriction.restriction_type)}</p>
            <p className='text-muted-foreground'>
              {formatRestrictionExpiry(restriction.expires_at)}
            </p>
            {restriction.reason && (
              <p className='text-muted-foreground'>
                {t('extracted.communities.communityRaidModeActiveList.reasonReason_ae08e67f', {
                  reason: restriction.reason,
                })}
              </p>
            )}
          </div>
          <Button
            type='button'
            variant='outline'
            size='sm'
            loading={liftingId === restriction.id}
            disabled={isBusy}
            onClick={() => onLift(restriction.id)}
            data-pw='community-raid-mode-lift'
          >
            <ShieldOff className='mr-2 h-4 w-4' />
            {t('extracted.communities.communityRaidModeActiveList.lift_871eee33')}
          </Button>
        </div>
      ))}
    </div>
  )
}
