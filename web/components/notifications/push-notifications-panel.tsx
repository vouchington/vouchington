'use client'

import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n/use-translations'

interface PushNotificationsPanelProps {
  currentSubscriptionId: string | undefined
  pushEnabled: boolean
  pushStatus: 'idle' | 'working'
  onDisablePush: (subscriptionId: string) => void
  onEnablePush: () => void
}

export function PushNotificationsPanel({
  currentSubscriptionId,
  pushEnabled,
  pushStatus,
  onDisablePush,
  onEnablePush,
}: PushNotificationsPanelProps) {
  const t = useTranslations()
  return (
    <div className='rounded-lg border bg-card'>
      <div className='flex items-center justify-between border-b px-4 py-3'>
        <div>
          <h2
            className='font-medium'
            data-pw='push-notifications-heading'
          >
            {t('extracted.notifications.pushNotificationsPanel.pushNotifications_3b1776f5')}
          </h2>
          <p className='text-sm text-muted-foreground'>
            {t(
              'extracted.notifications.pushNotificationsPanel.receiveNotificationsEvenWhenThisTab_973e40a4',
            )}
          </p>
        </div>
        {pushEnabled ? (
          <Button
            type='button'
            variant='outline'
            onClick={() => {
              if (currentSubscriptionId) onDisablePush(currentSubscriptionId)
            }}
            disabled={pushStatus === 'working'}
            data-pw='push-notifications-disable-button'
          >
            {t('extracted.notifications.pushNotificationsPanel.disable_b7e3e4aa')}
          </Button>
        ) : (
          <Button
            type='button'
            onClick={onEnablePush}
            disabled={pushStatus === 'working'}
            data-pw='push-notifications-enable-button'
          >
            {t('extracted.notifications.pushNotificationsPanel.enable_5342e09f')}
          </Button>
        )}
      </div>
      <div
        className='px-4 py-3 text-sm text-muted-foreground'
        data-pw='push-notifications-status'
      >
        {pushEnabled ? 'Push notifications are enabled.' : 'Push notifications are disabled.'}
      </div>
    </div>
  )
}
