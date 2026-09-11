'use client'

import { UserAvatar } from '@/components/shared/user-avatar'
import { UserLink } from '@/components/users/user-link'
import type { CommunityMembersResponseBody } from '@/types/api-responses'
import { useTranslations } from '@/lib/i18n/use-translations'

interface CommunityModeratorsAsideProps {
  owners: CommunityMembersResponseBody | null
  moderators: CommunityMembersResponseBody | null
}

export function CommunityModeratorsAside({ owners, moderators }: CommunityModeratorsAsideProps) {
  const t = useTranslations()
  const hasOwners = owners != null && owners.results.length > 0
  const hasModerators = moderators != null && moderators.results.length > 0

  if (!hasOwners && !hasModerators) return null

  return (
    <div
      className='rounded-md border bg-card p-4'
      data-pw='community-moderators-aside'
    >
      {hasOwners && (
        <ModeratorGroup
          title={t('extracted.communities.communityModeratorsAside.owner_4b1b8aa3')}
          data={owners}
        />
      )}
      {hasModerators && (
        <ModeratorGroup
          title={t('extracted.communities.communityModeratorsAside.moderators_0f118fc3')}
          data={moderators}
        />
      )}
    </div>
  )
}

function ModeratorGroup({ title, data }: { title: string; data: CommunityMembersResponseBody }) {
  const members = data.results.flatMap(result =>
    data.community_members[result.id] != null ? [data.community_members[result.id]!] : [],
  )

  if (members.length === 0) return null

  return (
    <div className='mt-4 first:mt-0'>
      <h3 className='mb-2 text-xs font-medium text-muted-foreground'>{title}</h3>
      <ul className='space-y-2'>
        {members.map(member => {
          const user = data.users[member.user_id]
          if (!user) return null
          const username = user.username ?? user.id
          return (
            <li
              key={member.id}
              className='flex items-center gap-2 text-sm'
            >
              <UserAvatar
                profileImageId={user.profile_image_id}
                username={username}
                size='sm'
              />
              <UserLink
                user={user}
                className='font-medium hover:underline'
              />
            </li>
          )
        })}
      </ul>
    </div>
  )
}
