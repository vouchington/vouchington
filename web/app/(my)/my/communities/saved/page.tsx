import type { Metadata } from 'next'
import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { BookmarkPageHeader } from '@/components/my/bookmark-page-header'
import { UserCommunityRelationRoute } from '@/components/users/user-relation-route-pages'
import { USER_RELATION_ACTIONS } from '@/components/users/user-relation-actions'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('My Saved Communities')

export default async function MyCommunitiesSavedPage() {
  const currentUser = await requireCurrentUser()
  return (
    <div
      className='space-y-6'
      data-pw='my-communities-saved-page'
    >
      <BookmarkPageHeader routeKey='communities/saved' />
      <UserCommunityRelationRoute
        idOrUsername={currentUser.id}
        listType='saved'
        relationAction={USER_RELATION_ACTIONS.community.saved}
      />
    </div>
  )
}
