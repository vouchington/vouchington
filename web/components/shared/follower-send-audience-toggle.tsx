'use client'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { Audience } from './follower-share-actions-utils'
import { useTranslations } from '@/lib/i18n/use-translations'

interface FollowerSendAudienceToggleProps {
  audience: Audience
  onAudienceChange: (audience: Audience) => void
}

export function FollowerSendAudienceToggle({
  audience,
  onAudienceChange,
}: FollowerSendAudienceToggleProps) {
  const t = useTranslations()
  return (
    <ToggleGroup
      type='single'
      aria-label={t('extracted.shared.followerSendAudienceToggle.sendAudience_9f92001c')}
      value={audience}
      onValueChange={(value: string) => {
        if (value) onAudienceChange(value as Audience)
      }}
      className='grid grid-cols-2 gap-2'
    >
      <ToggleGroupItem
        value='all_followers'
        variant='outline'
        className='data-[state=on]:bg-primary data-[state=on]:text-primary-foreground'
      >
        {t('extracted.shared.followerSendAudienceToggle.allFollowers_0d2ac250')}
      </ToggleGroupItem>
      <ToggleGroupItem
        value='selected_followers'
        variant='outline'
        className='data-[state=on]:bg-primary data-[state=on]:text-primary-foreground'
      >
        {t('extracted.shared.followerSendAudienceToggle.selectedFollowers_2a79a04d')}
      </ToggleGroupItem>
    </ToggleGroup>
  )
}
