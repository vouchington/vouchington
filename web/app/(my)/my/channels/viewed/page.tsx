import type { Metadata } from 'next'
import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { BookmarkPageHeader } from '@/components/my/bookmark-page-header'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { UserViewedRssFeedRoute } from '@/components/users/user-relation-route-pages'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('My Recently Viewed Channels')

export default async function MyChannelsViewedPage() {
  const currentUser = await requireCurrentUser()

  return (
    <div
      className='space-y-6'
      data-pw='my-channels-viewed-page'
    >
      <BookmarkPageHeader routeKey='channels/viewed' />
      <UserViewedRssFeedRoute
        idOrUsername={currentUser.id}
        feedType='video'
        emptyTitle='No recently viewed channels'
        emptyDescription='There are no recently viewed channels to show.'
      />
    </div>
  )
}
