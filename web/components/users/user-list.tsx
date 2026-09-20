'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/empty-state'
import { EntityBookmarkButton } from '@/components/shared/entity-bookmark-button'
import { UserAvatar } from '@/components/shared/user-avatar'
import { userHref } from '@/lib/links/entity-href'
import type { UserSearchResult } from '@/types/user'
import { UserOfficialBadge } from '@/components/shared/user-official-badge'
import { useTranslations } from '@/lib/i18n/use-translations'
import {
  RelationManagementAction,
  type RelationManagementActionConfig,
} from './relation-management-action'
import { UserSearchListItemContent } from './user-search-list-item-content'

export function UserListItem({
  user,
  currentUserId,
  muted,
  showAdminAffordances,
  context,
  actions,
}: {
  user: UserSearchResult
  currentUserId?: string
  muted?: boolean
  showAdminAffordances?: boolean
  context?: ReactNode
  actions?: ReactNode
}) {
  return (
    <Card
      // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
      data-pw={`user-card-${user.id}`}
      className='p-4'
    >
      <UserSearchListItemContent
        user={user}
        currentUserId={currentUserId}
        muted={muted}
        showAdminAffordances={showAdminAffordances}
      />
      {context ? <div className='mt-2 text-xs text-muted-foreground'>{context}</div> : null}
      {actions ? <div className='mt-3'>{actions}</div> : null}
    </Card>
  )
}

export function UserList({
  users,
  emptyTitle,
  emptyDescription,
  relationAction,
  currentUserId,
  muted,
  searchMode,
  showAdminAffordances,
}: {
  users: UserSearchResult[]
  emptyTitle: string
  emptyDescription: string
  relationAction?: RelationManagementActionConfig
  currentUserId?: string
  muted?: Record<string, boolean>
  searchMode?: boolean
  showAdminAffordances?: boolean
}) {
  const t = useTranslations()
  if (users.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
      />
    )
  }

  return (
    <div className={searchMode ? 'flex flex-col gap-4' : 'space-y-4'}>
      {users.map(user => {
        if (searchMode) {
          return (
            <UserListItem
              key={user.id}
              user={user}
              currentUserId={currentUserId}
              muted={muted?.[user.id]}
              showAdminAffordances={showAdminAffordances}
            />
          )
        }

        const username = user.username ?? user.id
        const displayName = user.display_account?.name || username
        const handle = user.username ? `@${user.username}` : null
        const showMuteButton =
          !relationAction && currentUserId !== undefined && currentUserId !== user.id

        return (
          <Card
            key={user.id}
            className='p-4'
            data-pw='user-list-item'
          >
            <Link
              href={userHref(user)}
              className='flex items-center gap-3'
              prefetch={false}
            >
              <div className='min-w-0 flex-1'>
                <div className='flex items-center gap-1.5'>
                  <p className='truncate font-medium'>{displayName}</p>
                  <UserOfficialBadge isOfficial={user.is_official_account} />
                </div>
                {handle ? <p className='truncate text-sm text-muted-foreground'>{handle}</p> : null}
              </div>
              {user.profile_image_id && (
                <UserAvatar
                  profileImageId={user.profile_image_id}
                  profileImagePlacement={user.profile_image_placement}
                  username={username}
                  className='flex-shrink-0'
                />
              )}
            </Link>
            {relationAction ? (
              <div className='mt-3'>
                <RelationManagementAction
                  entityId={user.id}
                  config={relationAction}
                />
              </div>
            ) : null}
            {showMuteButton ? (
              <div className='mt-3'>
                <EntityBookmarkButton
                  entityType='user'
                  entityId={user.id}
                  preset='mute'
                  initialActive={muted?.[user.id]}
                  inactiveTooltip={t('extracted.users.userList.hideThisUserFromYourFeed_af72353f')}
                  activeTooltip={t('extracted.users.userList.unmuteThisUser_e0f99e00')}
                  data-pw='user-list-mute-button'
                />
              </div>
            ) : null}
          </Card>
        )
      })}
    </div>
  )
}
