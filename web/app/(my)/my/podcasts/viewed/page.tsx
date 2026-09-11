import type { Metadata } from 'next'
import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { BookmarkPageHeader } from '@/components/my/bookmark-page-header'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { UserViewedRssFeedRoute } from '@/components/users/user-relation-route-pages'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('My Recently Viewed Podcasts')

export default async function MyPodcastsViewedPage() {
  const currentUser = await requireCurrentUser()

  return (
    <div
      className='space-y-6'
      data-pw='my-podcasts-viewed-page'
    >
      <BookmarkPageHeader routeKey='podcasts/viewed' />
      <UserViewedRssFeedRoute
        idOrUsername={currentUser.id}
        feedType='podcast'
        emptyTitle='No recently viewed podcasts'
        emptyDescription='There are no recently viewed podcasts to show.'
      />
    </div>
  )
}
