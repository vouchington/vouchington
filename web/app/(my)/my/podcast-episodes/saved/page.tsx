import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { BookmarkPageHeader } from '@/components/my/bookmark-page-header'
import { RssBookmarkTypeFilter } from '@/components/my/rss-bookmark-type-filter'
import { UserSavedRssFeedItemsRoute } from '@/components/users/user-relation-route-pages'
import { createNoIndexMetadata } from '@/lib/seo/metadata'

export const dynamic = 'force-dynamic'
export const metadata = createNoIndexMetadata('My Saved Podcast Episodes')

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function MyPodcastEpisodesSavedPage({
  searchParams: searchParamsPromise,
}: PageProps) {
  const currentUser = await requireCurrentUser()
  const searchParams = await searchParamsPromise

  return (
    <div
      className='space-y-6'
      data-pw='my-podcast-episodes-saved-page'
    >
      <BookmarkPageHeader routeKey='podcast-episodes/saved' />
      <RssBookmarkTypeFilter listType='saved' />
      <UserSavedRssFeedItemsRoute
        idOrUsername={currentUser.id}
        searchParams={searchParams}
        mediaType='audio'
        modalPathname='/my/podcast-episodes/saved'
      />
    </div>
  )
}
