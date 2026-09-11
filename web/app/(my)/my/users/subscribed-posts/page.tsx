import type { Metadata } from 'next'
import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { BookmarkPageHeader } from '@/components/my/bookmark-page-header'
import { UserUserRelationRoute } from '@/components/users/user-relation-route-pages'
import { USER_RELATION_ACTIONS } from '@/components/users/user-relation-actions'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('My User Post Subscriptions')

export default async function MyUsersSubscribedPostsPage() {
  const currentUser = await requireCurrentUser()
  return (
    <div
      className='space-y-6'
      data-pw='my-users-subscribed-posts-page'
    >
      <BookmarkPageHeader routeKey='users/subscribed-posts' />
      <UserUserRelationRoute
        idOrUsername={currentUser.id}
        listType='subscribed-posts'
        emptyTitle='No user post subscriptions'
        emptyDescription='You are not subscribed to any users for new posts yet.'
        relationAction={USER_RELATION_ACTIONS.user.subscribedPosts}
      />
    </div>
  )
}
