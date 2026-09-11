'use client'

import { EntityBookmarkButton } from '@/components/shared/entity-bookmark-button'
import { ReportInlineButton } from '@/components/shared/report-menu-item'
import { ButtonGroup } from '@/components/ui/button-group'
import { Card } from '@/components/ui/card'
import { useAuth } from '@/lib/auth/context'
import { useTranslations } from '@/lib/i18n/use-translations'

interface UserActionsAsideProps {
  userId: string
}
export function UserActionsAside({ userId }: UserActionsAsideProps) {
  const t = useTranslations()
  const { currentUser, isAuthenticated } = useAuth()
  if (currentUser?.id === userId) return null

  return (
    <Card className='p-4'>
      <h3 className='text-sm font-semibold'>
        {t('extracted.users.userActionsAside.actions_ff8059dc')}
      </h3>
      <ButtonGroup className='mt-3'>
        <EntityBookmarkButton
          entityType='user'
          entityId={userId}
          preset='subscribe'
          size='touchSm'
          inactiveLabel={t('extracted.users.userActionsAside.subscribeToPosts_16ab036b')}
          activeLabel={t('extracted.users.userActionsAside.subscribedToPosts_d21eed77')}
          tooltip={t('extracted.users.userActionsAside.getNotifiedWhenThisUserCreates_b1e6fa0e')}
          data-pw='user-profile-subscribe-posts-button'
        />
        <EntityBookmarkButton
          entityType='user'
          entityId={userId}
          preset='mute'
          size='touchSm'
          tooltip={t('extracted.users.userActionsAside.hideThisUserFromYourFeed_af72353f')}
          data-pw='user-mute-button'
        />
        <EntityBookmarkButton
          entityType='user'
          entityId={userId}
          preset='block'
          size='touchSm'
          tooltip={t('extracted.users.userActionsAside.blockThisUserFromInteractingWith_0b211783')}
          data-pw='user-block-button'
        />
        <ReportInlineButton
          entityType='user'
          entityId={userId}
          isAuthenticated={isAuthenticated}
        />
      </ButtonGroup>
    </Card>
  )
}
