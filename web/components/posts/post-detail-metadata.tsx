import { UserOfficialBadge } from '@/components/shared/user-official-badge'
import { TimeAgo } from '@/components/shared/time-ago'
import { UserAvatar } from '@/components/shared/user-avatar'
import { UserLink } from '@/components/users/user-link'
import type { PublicUser } from '@/types/user'

export function PostDetailMetadata({
  authorName,
  author,
  createdAt,
  bylineLabel,
  separatorLabel,
}: {
  authorName: string
  author?: Pick<PublicUser, 'id' | 'username' | 'profile_image_id' | 'is_official_account'> | null
  createdAt: string
  bylineLabel: string
  separatorLabel: string
}) {
  const byline = <span data-pw='post-detail-byline'>{bylineLabel}</span>
  return (
    <div className='flex items-center gap-2 text-sm text-muted-foreground'>
      {author ? (
        <UserLink
          user={author}
          className='flex items-center gap-1.5 hover:opacity-80'
          data-pw='post-detail-byline-link'
        >
          <UserAvatar
            profileImageId={author.profile_image_id}
            username={author.username ?? authorName}
            size='sm'
          />
          {byline}
        </UserLink>
      ) : (
        byline
      )}
      <UserOfficialBadge isOfficial={author?.is_official_account} />
      <span>{separatorLabel}</span>
      <TimeAgo date={createdAt} />
    </div>
  )
}
