import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { getUserRssFeedsCollection } from '@/lib/api/server'
import { PaginatedUserRssFeedList } from '@/components/users/paginated-user-rss-feed-list'
import { BookmarkPageHeader } from '@/components/my/bookmark-page-header'
import { AddSourceButton } from '@/components/sources/add-source-button'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { getTranslations } from '@/lib/i18n/get-translations'

export const metadata = createNoIndexMetadata('My Channels')

export const dynamic = 'force-dynamic'

export default async function MyChannelsPage() {
  const [t, currentUser] = await Promise.all([getTranslations(), requireCurrentUser()])

  const feedsData = await getUserRssFeedsCollection(currentUser.id, 'following', {
    feedType: 'video',
  })
  if (!feedsData) throw new Error('Failed to load followed channels')

  return (
    <div className='space-y-6'>
      <BookmarkPageHeader
        routeKey='channels'
        actions={<AddSourceButton kind='video' />}
      />
      <PaginatedUserRssFeedList
        initialData={feedsData}
        endpoint={`/api/v1/users/${encodeURIComponent(currentUser.id)}/rss-feeds/following`}
        params={{ feed_type: 'video' }}
        emptyTitle={t('extracted.channels.page.noChannelsFollowed_84f7ac66')}
        emptyDescription={t('extracted.channels.page.youAreNotFollowingAnyChannels_5f6a7b8c')}
        refreshOnUnfollow
      />
    </div>
  )
}
