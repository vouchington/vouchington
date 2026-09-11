'use client'

import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { EntityActionIcons } from '@/components/shared/entity-action-icons'
import { useTranslations } from '@/lib/i18n/use-translations'

interface FollowerShareMenuItemsProps {
  isSharePending: boolean
  onShare: () => Promise<void>
  onSendOpen: () => void
}

export function FollowerShareMenuItems({
  isSharePending,
  onShare,
  onSendOpen,
}: FollowerShareMenuItemsProps) {
  const t = useTranslations()
  const SendIcon = EntityActionIcons.sendToFollowers
  const ShareIcon = EntityActionIcons.shareWithFollowers

  return (
    <>
      <DropdownMenuItem
        disabled={isSharePending}
        onSelect={() => onShare().catch(() => undefined)}
        title={t('extracted.posts.followerShareMenuItems.shareAppearsInYourFollowersFeed_3bcbcbb1')}
        data-pw='post-detail-share-button'
      >
        <ShareIcon />
        {t('extracted.posts.followerShareMenuItems.shareWithFollowers_17e9713e')}
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={onSendOpen}
        title={t(
          'extracted.posts.followerShareMenuItems.sendSendsANotificationToSelected_198345fe',
        )}
        data-pw='post-detail-send-button'
      >
        <SendIcon />
        {t('extracted.posts.followerShareMenuItems.sendToFollowers_2359fc98')}
      </DropdownMenuItem>
    </>
  )
}
