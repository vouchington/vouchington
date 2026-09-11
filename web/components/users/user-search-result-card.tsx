import type { UserSearchResult } from '@/types/user'
import { UserListItem } from './user-list'

export function UserSearchResultCard({
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
  return (
    <UserListItem
      user={user}
      currentUserId={currentUserId}
      muted={muted}
      showAdminAffordances={showAdminAffordances}
    />
  )
}
