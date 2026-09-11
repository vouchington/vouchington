import { UserAvatar } from '@/components/shared/user-avatar'
import type { DirectMessageParticipant } from '@/types/messages'
import { getGroupConversationLabel } from './group-conversation-label'

interface Props {
  participants: DirectMessageParticipant[]
  currentUserId: string
}

export function GroupThreadHeader({ participants, currentUserId }: Props) {
  const others = participants.filter(p => p.user_id !== currentUserId)
  const displayed = others.slice(0, 3)
  const label = getGroupConversationLabel(others)

  return (
    <div
      data-pw='group-thread-header'
      className='flex items-center gap-2 border-b pb-3'
    >
      <div className='flex -space-x-2'>
        {displayed.map(p => (
          <UserAvatar
            key={p.id}
            profileImageId={p.profile_image_id ?? null}
            username={p.username ?? ''}
            size='sm'
          />
        ))}
      </div>
      <p className='text-sm font-medium'>{label}</p>
    </div>
  )
}
