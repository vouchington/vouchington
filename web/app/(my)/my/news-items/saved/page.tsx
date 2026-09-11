import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { BookmarkPageHeader } from '@/components/my/bookmark-page-header'
import { RssBookmarkTypeFilter } from '@/components/my/rss-bookmark-type-filter'
import { UserSavedRssFeedItemsRoute } from '@/components/users/user-relation-route-pages'
import { createNoIndexMetadata } from '@/lib/seo/metadata'

export const dynamic = 'force-dynamic'
export const metadata = createNoIndexMetadata('My Saved News Items')

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function MyNewsItemsSavedPage({
  searchParams: searchParamsPromise,
}: PageProps) {
  const currentUser = await requireCurrentUser()
  const searchParams = await searchParamsPromise

  return (
    <div
      className='space-y-6'
      data-pw='my-news-items-saved-page'
    >
      <BookmarkPageHeader routeKey='news-items/saved' />
      <RssBookmarkTypeFilter listType='saved' />
      <UserSavedRssFeedItemsRoute
        idOrUsername={currentUser.id}
        searchParams={searchParams}
        mediaType='article'
        modalPathname='/my/news-items/saved'
      />
    </div>
  )
}
