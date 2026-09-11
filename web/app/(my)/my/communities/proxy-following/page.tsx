import type { Metadata } from 'next'
import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { BookmarkPageHeader } from '@/components/my/bookmark-page-header'
import { UserCommunityRelationRoute } from '@/components/users/user-relation-route-pages'
import { USER_RELATION_ACTIONS } from '@/components/users/user-relation-actions'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('My Proxy-Followed Communities')

export default async function MyCommunitiesProxyFollowingPage() {
  const currentUser = await requireCurrentUser()
  return (
    <div
      className='space-y-6'
      data-pw='my-communities-proxy-following-page'
    >
      <BookmarkPageHeader routeKey='communities/proxy-following' />
      <UserCommunityRelationRoute
        idOrUsername={currentUser.id}
        listType='proxy-following'
        relationAction={USER_RELATION_ACTIONS.community.proxyFollowing}
      />
    </div>
  )
}
