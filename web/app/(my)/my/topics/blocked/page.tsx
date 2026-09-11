import type { Metadata } from 'next'
import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { BookmarkPageHeader } from '@/components/my/bookmark-page-header'
import { UserTopicRelationRoute } from '@/components/users/user-relation-route-pages'
import { USER_RELATION_ACTIONS } from '@/components/users/user-relation-actions'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('My Blocked Topics')

export default async function MyTopicsBlockedPage() {
  const currentUser = await requireCurrentUser()
  return (
    <div
      className='space-y-6'
      data-pw='my-topics-blocked-page'
    >
      <BookmarkPageHeader routeKey='topics/blocked' />
      <UserTopicRelationRoute
        idOrUsername={currentUser.id}
        listType='blocked'
        emptyTitle='No blocked topics'
        emptyDescription='You have not blocked any topics yet.'
        relationAction={USER_RELATION_ACTIONS.topic.blocked}
      />
    </div>
  )
}
