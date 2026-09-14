'use client'

import type { ReactNode } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { EntityActionIcons } from './entity-action-icons'
import { useTranslations } from '@/lib/i18n/use-translations'

interface FollowerShareActionButtonsProps {
  className?: string
  compact: boolean
  isSharePending: boolean
  onSendOpen: () => void
  onShare: () => Promise<void>
  /**
   * Additional menu items rendered at the top of the compact dropdown, before the share actions.
   * A separator is added when this prop is provided. Pass `undefined` (i.e. omit the prop) when
   * there are no leading items — do not pass an empty fragment, as it is still truthy and would
   * render an orphaned separator.
   */
  menuLeadingItems?: ReactNode
  /** Override the `data-pw` attribute on the compact trigger button. */
  dataPw?: string
}

export function FollowerShareActionButtons({
  className,
  compact,
  isSharePending,
  onSendOpen,
  onShare,
  menuLeadingItems,
  dataPw = 'follower-share-more-actions-button',
}: FollowerShareActionButtonsProps) {
  const t = useTranslations()
  const MoreActionsIcon = EntityActionIcons.more
  const SendIcon = EntityActionIcons.sendToFollowers
  const ShareIcon = EntityActionIcons.shareWithFollowers

  if (compact) {
    return (
      <div className={className}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              className='min-h-11 min-w-11 p-0'
              aria-label={t('extracted.shared.followerShareActionButtons.moreActions_f8d46c25')}
              data-pw={dataPw}
            >
              <MoreActionsIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            {menuLeadingItems}
            {menuLeadingItems ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              disabled={isSharePending}
              onSelect={() => onShare().catch(Sentry.captureException)}
              title={t(
                'extracted.shared.followerShareActionButtons.shareAppearsInYourFollowersFeed_3bcbcbb1',
              )}
              data-pw='follower-share-menu-share'
            >
              <ShareIcon />
              {t('extracted.shared.followerShareActionButtons.shareWithFollowers_17e9713e')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={onSendOpen}
              title={t(
                'extracted.shared.followerShareActionButtons.sendSendsANotificationToSelected_198345fe',
              )}
              data-pw='follower-share-menu-send'
            >
              <SendIcon />
              {t('extracted.shared.followerShareActionButtons.sendToFollowers_2359fc98')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-wrap items-center justify-end gap-2', className)}>
      <Button
        type='button'
        variant='outline'
        size='sm'
        disabled={isSharePending}
        onClick={() => onShare().catch(Sentry.captureException)}
        title={t(
          'extracted.shared.followerShareActionButtons.shareAppearsInYourFollowersFeed_3bcbcbb1',
        )}
      >
        {t('extracted.shared.followerShareActionButtons.shareWithFollowers_17e9713e')}
      </Button>
      <Button
        type='button'
        variant='outline'
        size='sm'
        onClick={onSendOpen}
        title={t(
          'extracted.shared.followerShareActionButtons.sendSendsANotificationToSelected_198345fe',
        )}
      >
        <SendIcon
          data-icon='inline-start'
          className='!h-3.5 !w-3.5'
        />
        {t('extracted.shared.followerShareActionButtons.sendToFollowers_2359fc98')}
      </Button>
    </div>
  )
}
