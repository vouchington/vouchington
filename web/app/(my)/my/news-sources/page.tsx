import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { getUserRssFeedsCollection } from '@/lib/api/server'
import { PaginatedUserRssFeedList } from '@/components/users/paginated-user-rss-feed-list'
import { BookmarkPageHeader } from '@/components/my/bookmark-page-header'
import { AddSourceButton } from '@/components/sources/add-source-button'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { getTranslations } from '@/lib/i18n/get-translations'

export const metadata = createNoIndexMetadata('My News Sources')

export const dynamic = 'force-dynamic'

export default async function MyNewsSourcesPage() {
  const [t, currentUser] = await Promise.all([getTranslations(), requireCurrentUser()])

  const feedsData = await getUserRssFeedsCollection(currentUser.id, 'following', {
    feedType: 'article',
  })
  if (!feedsData) throw new Error('Failed to load followed news sources')

  return (
    <div className='space-y-6'>
      <BookmarkPageHeader
        routeKey='news-sources'
        actions={<AddSourceButton kind='news' />}
      />
      <PaginatedUserRssFeedList
        initialData={feedsData}
        endpoint={`/api/v1/users/${encodeURIComponent(currentUser.id)}/rss-feeds/following`}
        params={{ feed_type: 'article' }}
        emptyTitle={t('extracted.newsSources.page.noNewsSourcesFollowed_8ca50592')}
        emptyDescription={t(
          'extracted.newsSources.page.youAreNotFollowingAnyNewsSourcesYet_3c4d5e6f',
        )}
        refreshOnUnfollow
      />
    </div>
  )
}
