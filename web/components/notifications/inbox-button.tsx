'use client'

import { Bell, CheckCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useRouter } from 'next/navigation'
import type { Notification } from '@/types/api-responses'
import type { NotificationListNotification } from './notification-list'
import { NotificationRow } from './notification-row'
import { useInboxButton } from './use-inbox-button'
import { useTranslations } from '@/lib/i18n/use-translations'

export function InboxButton() {
  const t = useTranslations()
  const { push } = useRouter()
  const inbox = useInboxButton()

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <DropdownMenu
          open={inbox.open}
          onOpenChange={inbox.handleOpenChange}
        >
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant='ghost'
                size='icon'
                className='relative'
                aria-label={t('extracted.notifications.inboxButton.openInbox_0f7bb6eb')}
                data-pw='inbox-open-button'
              >
                <Bell className='h-4 w-4' />
                {inbox.summary.unread_count > 0 && (
                  <span className='absolute right-1 top-1 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-xs font-semibold text-destructive-foreground'>
                    {inbox.summary.unread_count > 9 ? '9+' : inbox.summary.unread_count}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <DropdownMenuContent
            align='end'
            className='w-[360px] p-0'
          >
            <div className='flex items-center justify-between px-3 py-2'>
              <DropdownMenuLabel className='p-0'>
                {t('extracted.notifications.inboxButton.inbox_94835ea2')}
              </DropdownMenuLabel>
              <Button
                type='button'
                variant='ghost'
                size='sm'
                className='h-8 px-2 text-xs'
                onClick={inbox.handleMarkAllRead}
                disabled={inbox.summary.unread_count === 0}
              >
                <CheckCheck className='mr-1 h-3 w-3' />
                {t('extracted.notifications.inboxButton.markAllAsRead_d7592650')}
              </Button>
            </div>
            <DropdownMenuSeparator className='m-0' />
            <ScrollArea className='max-h-[420px]'>
              {inbox.loading ? (
                <div className='px-3 py-6 text-sm text-muted-foreground'>
                  {t('extracted.notifications.inboxButton.loadingNotifications_eae12e0d')}
                </div>
              ) : inbox.summary.results.length === 0 ? (
                <div className='px-3 py-6 text-sm text-muted-foreground'>
                  {t('extracted.notifications.inboxButton.noUnreadNotifications_7b967630')}
                </div>
              ) : (
                inbox.summary.results.map(result => {
                  const notification = inbox.summary.notifications[result.id]
                  if (!notification) return null

                  return (
                    <NotificationRow
                      key={notification.id}
                      notification={notification as NotificationListNotification}
                      onOpen={n => inbox.handleClickNotification(n as Notification)}
                      onDelete={inbox.handleDeleteNotification}
                      compact
                    />
                  )
                })
              )}
            </ScrollArea>
            <DropdownMenuSeparator className='m-0' />
            <div className='p-2'>
              <Button
                type='button'
                variant='ghost'
                className='w-full justify-start'
                onClick={() => {
                  inbox.setOpen(false)
                  push('/my/notifications')
                }}
                data-pw='inbox-view-all-button'
              >
                {t('extracted.notifications.inboxButton.viewAllNotifications_13af64d6')}
              </Button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
        <TooltipContent>{t('extracted.notifications.inboxButton.inbox_94835ea2')}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
