'use client'

import { ProxiedImage as Image } from '@/components/shared/proxied-image'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { userHref } from '@/lib/links/entity-href'
import { getImageUrl } from '@/lib/utils/image-url'
import type { Community, CommunityMember } from '@/types/api-responses'
import type { CommunityMembersManagerState } from './use-community-members-manager'
import { UserModNotesControl } from '../moderation/user-mod-notes-cell'
import { BanDialog } from './community-ban-dialog'
import { TransferOwnershipDialog } from './community-transfer-ownership-dialog'
import { useTranslations } from '@/lib/i18n/use-translations'

interface CommunityMemberRowProps {
  community: Community
  currentUserMembership: CommunityMember | null | undefined
  isOwner: boolean
  member: CommunityMember
  state: CommunityMembersManagerState
}

export function CommunityMemberRow(props: CommunityMemberRowProps) {
  const t = useTranslations()
  const user = props.state.users[props.member.user_id]
  const isCurrentUserMember = props.member.user_id === props.currentUserMembership?.user_id
  const isMemberOwner = props.member.role === 'owner'
  const canManageBans =
    (props.isOwner || props.state.isModerator) && !isMemberOwner && !isCurrentUserMember
  // Moderators can only ban regular members
  const canBanTarget = canManageBans && (props.isOwner || props.member.role === 'member')
  const canManageNotes = (props.isOwner || props.state.isModerator) && !isCurrentUserMember

  return (
    <div
      className='flex items-center justify-between rounded-md border bg-card p-4'
      data-community-member-id={props.member.user_id}
    >
      <div className='flex items-center gap-3'>
        {user?.profile_image_id && (
          <div className='relative h-8 w-8 overflow-hidden rounded-full bg-muted'>
            <Image
              src={getImageUrl(user.profile_image_id, { width: 64 })}
              alt={
                user.username
                  ? `@${user.username}`
                  : t('extracted.communities.communityMemberRow.userAvatar_e75e0e7c')
              }
              fill
              sizes='32px'
              unoptimized
              className='object-cover'
            />
          </div>
        )}
        <div>
          {user?.username ? (
            <Link
              href={userHref({ id: props.member.user_id, username: user?.username })}
              prefetch={false}
              className='font-medium hover:underline'
            >
              @{user.username}
            </Link>
          ) : (
            <span className='font-medium text-muted-foreground'>
              {t('extracted.communities.communityMemberRow.unknownUser_0bca6947')}
            </span>
          )}
        </div>
      </div>
      <div className='flex items-center gap-2'>
        {canManageNotes && (
          <UserModNotesControl
            targetUserId={props.member.user_id}
            communityId={props.community.id}
          />
        )}
        <Badge variant='secondary'>{props.member.role}</Badge>
        {props.isOwner && !isMemberOwner && !isCurrentUserMember && (
          <CommunityMemberOwnerActions
            community={props.community}
            member={props.member}
            state={props.state}
            username={user?.username}
          />
        )}
        {canBanTarget && (
          <BanDialog
            banLoading={isLoading(props.state.loading, props.member.user_id, 'ban')}
            community={props.community}
            member={props.member}
            state={props.state}
            username={user?.username}
          />
        )}
      </div>
    </div>
  )
}

function CommunityMemberOwnerActions({
  community,
  member,
  state,
  username,
}: {
  community: Community
  member: CommunityMember
  state: CommunityMembersManagerState
  username?: string | null
}) {
  const t = useTranslations()
  const roleLoading = isLoading(state.loading, member.user_id, 'role')
  const removeLoading = isLoading(state.loading, member.user_id, 'remove')
  return (
    <>
      {member.role === 'moderator' && (
        <Button
          size='sm'
          variant='outline'
          loading={roleLoading}
          disabled={roleLoading}
          onClick={() => state.handleRemoveModerator(member.user_id)}
        >
          {roleLoading
            ? t('extracted.communities.communityMemberRow.saving_dc85af8f')
            : t('extracted.communities.communityMemberRow.removeModerator_06bc1e04')}
        </Button>
      )}
      {member.role === 'member' && (
        <Button
          size='sm'
          variant='outline'
          loading={roleLoading}
          disabled={roleLoading}
          onClick={() => state.handleMakeModerator(member.user_id)}
        >
          {roleLoading
            ? t('extracted.communities.communityMemberRow.saving_dc85af8f')
            : t('extracted.communities.communityMemberRow.makeModerator_92cf486a')}
        </Button>
      )}
      {member.role === 'moderator' && (
        <TransferOwnershipDialog
          community={community}
          member={member}
          state={state}
          username={username}
        />
      )}
      <Button
        size='sm'
        variant='destructive'
        loading={removeLoading}
        disabled={removeLoading}
        onClick={() => state.handleRemove(member.user_id)}
      >
        {removeLoading
          ? t('extracted.communities.communityMemberRow.removing_60d18e42')
          : t('extracted.communities.communityMemberRow.remove_c3812fc4')}
      </Button>
    </>
  )
}

function isLoading(
  loading: CommunityMembersManagerState['loading'],
  userId: string,
  action: NonNullable<CommunityMembersManagerState['loading']>['action'],
) {
  return loading?.userId === userId && loading.action === action
}
