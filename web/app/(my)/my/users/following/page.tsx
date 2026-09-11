import type { Metadata } from 'next'
import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { getUserUsersCollection } from '@/lib/api/server'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { BookmarkPageHeader } from '@/components/my/bookmark-page-header'
import { PaginatedUserList } from '@/components/users/paginated-user-list'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('My Followed Users')

export default async function MyUsersFollowingPage() {
  const currentUser = await requireCurrentUser()
  const usersData = await getUserUsersCollection(currentUser.id, 'following')
  return (
    <div
      className='space-y-6'
      data-pw='my-users-following-page'
    >
      <BookmarkPageHeader routeKey='users/following' />
      <PaginatedUserList
        initialData={usersData!}
        endpoint={`/api/v1/users/${encodeURIComponent(currentUser.id)}/users/following`}
        emptyTitle='No followed users'
        emptyDescription='You are not following anyone yet.'
        currentUserId={currentUser.id}
      />
    </div>
  )
}
