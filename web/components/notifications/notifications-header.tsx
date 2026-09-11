'use client'

import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { useTranslations } from '@/lib/i18n/use-translations'
import Link from 'next/link'

interface NotificationsHeaderProps {
  canMarkAllRead: boolean
  onMarkAllRead: () => void
}

export function NotificationsHeader({ canMarkAllRead, onMarkAllRead }: NotificationsHeaderProps) {
  const t = useTranslations()
  return (
    <div className='flex items-start justify-between gap-4'>
      <div>
        <h1
          className='text-2xl font-bold'
          data-pw='notifications-page-heading'
        >
          {t('extracted.notifications.notificationsHeader.notifications_78801183')}
        </h1>
        <p className='text-sm text-muted-foreground'>
          {t('extracted.notifications.notificationsHeader.manageYourInboxAndBrowserPush_ae9adb67')}
        </p>
      </div>
      <ButtonGroup>
        <Button
          asChild
          type='button'
          variant='outline'
          size='touchSm'
        >
          <Link
            href='/my/notification-settings'
            data-pw='notification-settings-link'
          >
            {t('nav.settings')}
          </Link>
        </Button>
        <Button
          type='button'
          variant='outline'
          onClick={onMarkAllRead}
          disabled={!canMarkAllRead}
        >
          {t('extracted.notifications.notificationsHeader.markAllAsRead_d7592650')}
        </Button>
      </ButtonGroup>
    </div>
  )
}
