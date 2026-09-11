import type { Metadata } from 'next'
import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { getUserUsersCollection } from '@/lib/api/server'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { BookmarkPageHeader } from '@/components/my/bookmark-page-header'
import { PaginatedUserList } from '@/components/users/paginated-user-list'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('My Followers')

export default async function MyUsersFollowersPage() {
  const currentUser = await requireCurrentUser()
  const usersData = await getUserUsersCollection(currentUser.id, 'followers')
  return (
    <div
      className='space-y-6'
      data-pw='my-users-followers-page'
    >
      <BookmarkPageHeader routeKey='users/followers' />
      <PaginatedUserList
        initialData={usersData!}
        endpoint={`/api/v1/users/${encodeURIComponent(currentUser.id)}/users/followers`}
        emptyTitle='No followers'
        emptyDescription='You do not have any followers yet.'
        currentUserId={currentUser.id}
      />
    </div>
  )
}
