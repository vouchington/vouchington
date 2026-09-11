import type { Metadata } from 'next'
import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { BookmarkPageHeader } from '@/components/my/bookmark-page-header'
import { UserPostRelationRoute } from '@/components/users/user-relation-route-pages'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('My Followed Posts')

export default async function MyPostsFollowingPage() {
  const currentUser = await requireCurrentUser()
  return (
    <div
      className='space-y-6'
      data-pw='my-posts-following-page'
    >
      <BookmarkPageHeader routeKey='posts/following' />
      <UserPostRelationRoute
        idOrUsername={currentUser.id}
        listType='following'
      />
    </div>
  )
}
