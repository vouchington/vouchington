import type { Metadata } from 'next'
import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { BookmarkPageHeader } from '@/components/my/bookmark-page-header'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { UserViewedRssFeedRoute } from '@/components/users/user-relation-route-pages'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('My Recently Viewed News Sources')

export default async function MyNewsSourcesViewedPage() {
  const currentUser = await requireCurrentUser()

  return (
    <div
      className='space-y-6'
      data-pw='my-news-sources-viewed-page'
    >
      <BookmarkPageHeader routeKey='news-sources/viewed' />
      <UserViewedRssFeedRoute
        idOrUsername={currentUser.id}
        feedType='article'
        emptyTitle='No recently viewed news sources'
        emptyDescription='There are no recently viewed news sources to show.'
      />
    </div>
  )
}
