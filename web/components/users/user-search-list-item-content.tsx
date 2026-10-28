'use client'

import Link from 'next/link'
import { Shield } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EntityBookmarkButton } from '@/components/shared/entity-bookmark-button'
import { UserAvatar } from '@/components/shared/user-avatar'
import { createUserPathname, userHref } from '@/lib/links/entity-href'
import { useTranslations } from '@/lib/i18n/use-translations'
import { getUserLabel } from '@/lib/users/get-user-label'
import type { UserSearchResult } from '@/types/user'

export function UserSearchListItemContent({
  user,
  currentUserId,
  muted,
  showAdminAffordances,
}: {
  user: UserSearchResult
  currentUserId?: string
  muted?: boolean
  showAdminAffordances?: boolean
}) {
  const t = useTranslations()
  const deletedUserLabel = t(
    'extracted.communities.communityAgentPromptHistory.deletedUser_152bc3aa',
  )
  const userLabel = getUserLabel(user, deletedUserLabel)
  const isSuspended = Boolean(user.suspended_at)
  const showMuteButton =
    !showAdminAffordances && currentUserId !== undefined && currentUserId !== user.id

  return (
    <>
      <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
        <Link
          href={userHref(user)}
          data-pw='user-card-link'
          className='flex min-w-0 items-center gap-3'
          prefetch={false}
        >
          <UserAvatar
            profileImagePlacement={user.profile_image_placement}
            username={userLabel}
            className='shrink-0'
          />
          <div className='min-w-0'>
            <p className='truncate font-medium'>{userLabel}</p>
            {user.username ? (
              <p className='truncate text-sm text-muted-foreground'>@{user.username}</p>
            ) : null}
            {showAdminAffordances && user.email_address ? (
              <p
                data-pw='user-card-email'
                className='truncate text-sm text-muted-foreground'
              >
                {user.email_address}
              </p>
            ) : null}
          </div>
        </Link>
        {showAdminAffordances ? (
          <div className='flex shrink-0 flex-wrap items-center gap-2'>
            <Badge
              data-pw='user-card-status'
              variant={isSuspended ? 'destructive' : 'secondary'}
            >
              {isSuspended
                ? t('extracted.users.userList.suspended_e392a389')
                : t('extracted.users.userList.active_92340695')}
            </Badge>
            <Button
              asChild
              variant='outline'
            >
              <Link
                href={createUserPathname(user, '/admin')}
                data-pw='user-card-manage-link'
                prefetch={false}
              >
                <Shield data-icon='inline-start' />
                {t('extracted.users.userList.manage_5a234448')}
              </Link>
            </Button>
          </div>
        ) : null}
      </div>
      {showMuteButton ? (
        <div className='mt-3'>
          <EntityBookmarkButton
            entityType='user'
            entityId={user.id}
            preset='mute'
            initialActive={muted}
            inactiveTooltip={t('extracted.users.userList.hideThisUserFromYourFeed_af72353f')}
            activeTooltip={t('extracted.users.userList.unmuteThisUser_e0f99e00')}
            data-pw='user-search-result-mute-button'
          />
        </div>
      ) : null}
    </>
  )
}
