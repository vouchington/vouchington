'use client'

import { TimeAgo } from '@/components/shared/time-ago'
import { EntityActionIcons } from '@/components/shared/entity-action-icons'
import { Button } from '@/components/ui/button'
import type { NotificationListNotification } from './notification-list'
import { NotificationIcon } from './notification-icon'
import { useTranslations } from '@/lib/i18n/use-translations'

interface NotificationRowProps {
  notification: NotificationListNotification
  onOpen: (notification: NotificationListNotification) => void
  onDelete: (notificationId: string) => void
  compact?: boolean
}

export function NotificationRow({ notification, onOpen, onDelete, compact }: NotificationRowProps) {
  const t = useTranslations()
  const DismissNotificationIcon = EntityActionIcons.notificationDismiss

  if (compact) {
    return (
      <div className='flex items-start gap-2 border-b px-3 py-3 last:border-b-0'>
        <Button
          type='button'
          variant='ghost'
          className='h-auto min-w-0 flex-1 flex-col items-start justify-start gap-0 px-0 py-0 text-left hover:bg-transparent'
          onClick={() => onOpen(notification)}
        >
          <span className='flex items-center gap-1.5'>
            <NotificationIcon
              entityType={notification.entity_type}
              size='sm'
            />
            <span className='block truncate text-sm font-medium'>{notification.title}</span>
          </span>
          {notification.body ? (
            <span className='mt-1 block line-clamp-2 text-xs text-muted-foreground'>
              {notification.body}
            </span>
          ) : null}
        </Button>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          className='h-8 w-8 shrink-0'
          aria-label={t('extracted.notifications.notificationRow.deleteNotification_511c8850')}
          onClick={() => onDelete(notification.id)}
        >
          <DismissNotificationIcon className='h-4 w-4' />
        </Button>
      </div>
    )
  }

  return (
    <div
      className='flex items-start gap-3 border-b p-4 last:border-b-0'
      // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
      data-pw={`notification-item-${notification.entity_type}`}
    >
      <Button
        type='button'
        variant='ghost'
        className='h-auto min-w-0 flex-1 flex-col items-start justify-start gap-0 px-0 py-0 text-left hover:bg-transparent'
        onClick={() => onOpen(notification)}
      >
        <span className='flex items-center gap-2'>
          <NotificationIcon entityType={notification.entity_type} />
          <span
            className='block text-sm font-medium'
            data-pw='notification-item-title'
          >
            {notification.title}
          </span>
          {!notification.read_at ? (
            <span className='inline-flex h-2 w-2 rounded-full bg-destructive' />
          ) : null}
        </span>
        {notification.body ? (
          <span className='mt-1 block text-sm text-muted-foreground'>{notification.body}</span>
        ) : null}
        <span className='mt-1 block text-xs text-muted-foreground'>
          <TimeAgo date={notification.created_at} />
        </span>
      </Button>
      <Button
        type='button'
        variant='ghost'
        size='touchIcon'
        className='shrink-0'
        aria-label={t('extracted.notifications.notificationRow.deleteNotification_511c8850')}
        onClick={() => onDelete(notification.id)}
      >
        <DismissNotificationIcon />
      </Button>
    </div>
  )
}
