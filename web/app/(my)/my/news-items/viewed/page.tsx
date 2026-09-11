import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { BookmarkPageHeader } from '@/components/my/bookmark-page-header'
import { RssBookmarkTypeFilter } from '@/components/my/rss-bookmark-type-filter'
import { UserViewedRssFeedItemsRoute } from '@/components/users/user-relation-route-pages'
import { createNoIndexMetadata } from '@/lib/seo/metadata'

export const dynamic = 'force-dynamic'
export const metadata = createNoIndexMetadata('My Recently Viewed News Items')

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function MyNewsItemsViewedPage({
  searchParams: searchParamsPromise,
}: PageProps) {
  const currentUser = await requireCurrentUser()
  const searchParams = await searchParamsPromise

  return (
    <div
      className='space-y-6'
      data-pw='my-news-items-viewed-page'
    >
      <BookmarkPageHeader routeKey='news-items/viewed' />
      <RssBookmarkTypeFilter listType='viewed' />
      <UserViewedRssFeedItemsRoute
        idOrUsername={currentUser.id}
        searchParams={searchParams}
        mediaType='article'
        modalPathname='/my/news-items/viewed'
      />
    </div>
  )
}
