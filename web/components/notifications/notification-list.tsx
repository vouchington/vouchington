'use client'

import { EmptyState } from '@/components/shared/empty-state'
import type { NotificationsResponseBody } from '@/types/api-responses'
import { NotificationRow } from './notification-row'
import { useTranslations } from '@/lib/i18n/use-translations'

import type { NotificationListNotification } from './notification-list-notification'
export type { NotificationListNotification } from './notification-list-notification'

interface NotificationListProps {
  notifications: {
    results: Array<Pick<NotificationsResponseBody['results'][number], 'id'>>
    notifications: Record<string, NotificationListNotification>
  }
  onOpen: (notification: NotificationListNotification) => void
  onDelete: (notificationId: string) => void
}

export function NotificationList({ notifications, onOpen, onDelete }: NotificationListProps) {
  const t = useTranslations()
  return (
    <div data-pw='notification-list'>
      {notifications.results.length === 0 ? (
        <EmptyState
          title={t('extracted.notifications.notificationList.noNotificationsYet_37ecf360')}
          description={t(
            'extracted.notifications.notificationList.whenYouGetNotificationsTheyLl_1e10cd76',
          )}
          icon='inbox'
          className='p-4'
        />
      ) : null}
      {notifications.results.map(result => {
        const notification = notifications.notifications[result.id]
        if (!notification) return null

        return (
          <NotificationRow
            key={notification.id}
            notification={notification}
            onOpen={onOpen}
            onDelete={onDelete}
          />
        )
      })}
    </div>
  )
}
