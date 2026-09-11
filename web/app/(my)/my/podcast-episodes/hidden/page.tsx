import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { BookmarkPageHeader } from '@/components/my/bookmark-page-header'
import { RssBookmarkTypeFilter } from '@/components/my/rss-bookmark-type-filter'
import { UserHiddenRssFeedItemsRoute } from '@/components/users/user-relation-route-pages'
import { createNoIndexMetadata } from '@/lib/seo/metadata'

export const dynamic = 'force-dynamic'
export const metadata = createNoIndexMetadata('My Hidden Podcast Episodes')

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function MyPodcastEpisodesHiddenPage({
  searchParams: searchParamsPromise,
}: PageProps) {
  const currentUser = await requireCurrentUser()
  const searchParams = await searchParamsPromise

  return (
    <div
      className='space-y-6'
      data-pw='my-podcast-episodes-hidden-page'
    >
      <BookmarkPageHeader routeKey='podcast-episodes/hidden' />
      <RssBookmarkTypeFilter listType='hidden' />
      <UserHiddenRssFeedItemsRoute
        idOrUsername={currentUser.id}
        searchParams={searchParams}
        mediaType='audio'
        showHeading={false}
        modalPathname='/my/podcast-episodes/hidden'
      />
    </div>
  )
}
