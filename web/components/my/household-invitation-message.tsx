import type { ReactNode } from 'react'
import { UserLink } from '@/components/users/user-link'
import type { HouseholdInvitation } from '@/types/household-invitations'

export const INVITEE_SLOT = '\uE000invitee\uE001'
export const INVITER_SLOT = '\uE000inviter\uE001'
export const OWNER_SLOT = '\uE000owner\uE001'

export function renderInvitationMessage(
  message: string,
  users: Record<string, HouseholdInvitation['invited_user']>,
  fallback: string,
): ReactNode[] {
  const slots = new RegExp(`(${[INVITEE_SLOT, INVITER_SLOT, OWNER_SLOT].join('|')})`, 'g')
  return message.split(slots).map(part => {
    const user = users[part]
    if (!user) return part
    return user.username ? (
      <UserLink
        data-pw='household-invitation-message-user-link'
        key={part}
        user={user}
        className='underline'
      >
        @{user.username}
      </UserLink>
    ) : (
      fallback
    )
  })
}
