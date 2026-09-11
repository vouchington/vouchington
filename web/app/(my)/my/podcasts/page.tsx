import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { getUserRssFeedsCollection } from '@/lib/api/server'
import { PaginatedUserRssFeedList } from '@/components/users/paginated-user-rss-feed-list'
import { BookmarkPageHeader } from '@/components/my/bookmark-page-header'
import { AddSourceButton } from '@/components/sources/add-source-button'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { getTranslations } from '@/lib/i18n/get-translations'

export const metadata = createNoIndexMetadata('My Podcasts')

export const dynamic = 'force-dynamic'

export default async function MyPodcastsPage() {
  const [t, currentUser] = await Promise.all([getTranslations(), requireCurrentUser()])

  const feedsData = await getUserRssFeedsCollection(currentUser.id, 'following', {
    feedType: 'podcast',
  })
  if (!feedsData) throw new Error('Failed to load followed podcasts')

  return (
    <div className='space-y-6'>
      <BookmarkPageHeader
        routeKey='podcasts'
        actions={<AddSourceButton kind='podcast' />}
      />
      <PaginatedUserRssFeedList
        initialData={feedsData}
        endpoint={`/api/v1/users/${encodeURIComponent(currentUser.id)}/rss-feeds/following`}
        params={{ feed_type: 'podcast' }}
        emptyTitle={t('extracted.podcasts.page.noPodcastsFollowed_2777e0f7')}
        emptyDescription={t('extracted.podcasts.page.youAreNotFollowingAnyPodcastsYet_4d5e6f70')}
        refreshOnUnfollow
      />
    </div>
  )
}
