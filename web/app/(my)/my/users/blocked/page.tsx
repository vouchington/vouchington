import type { Metadata } from 'next'
import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { BookmarkPageHeader } from '@/components/my/bookmark-page-header'
import { UserUserRelationRoute } from '@/components/users/user-relation-route-pages'
import { USER_RELATION_ACTIONS } from '@/components/users/user-relation-actions'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('My Blocked Users')

export default async function MyUsersBlockedPage() {
  const currentUser = await requireCurrentUser()
  return (
    <div
      className='space-y-6'
      data-pw='my-users-blocked-page'
    >
      <BookmarkPageHeader routeKey='users/blocked' />
      <UserUserRelationRoute
        idOrUsername={currentUser.id}
        listType='blocked'
        emptyTitle='No blocked users'
        emptyDescription='You have not blocked any users yet.'
        relationAction={USER_RELATION_ACTIONS.user.blocked}
      />
    </div>
  )
}
