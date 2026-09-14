export const dynamic = 'force-dynamic'

import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { EmptyState } from '@/components/shared/empty-state'
import { ListSearchError } from '@/components/shared/list-search-error'
import { RssFeedListItem } from '@/components/sources/rss-feed-list-item'
import { getRssFeeds } from '@/lib/api/server/rss-feeds'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { getListSearchErrorMessage, isListSearchErrorResult } from '@/lib/api/list-search-error'
import { createPageMetadata } from '@/lib/seo/metadata'
import {
  createBreadcrumbSchema,
  createCollectionPageSchema,
  createItemListSchema,
} from '@/lib/seo/structured-data'
import { AnonymousStructuredDataScript } from '@/components/seo/anonymous-structured-data-script'
import { PageWithAside } from '@/components/page-with-aside'
import { BrowsePageHeader } from '@/components/shared/browse-page-header'
import { AddSourceButton } from '@/components/sources/add-source-button'
import { getTranslations } from '@/lib/i18n/get-translations'

export const metadata = createPageMetadata({
  title: 'Podcasts',
  description:
    'Browse podcast shows on Voucha — discover and listen to episodes across every category.',
  path: '/podcasts',
})

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function PodcastsPage({ searchParams }: PageProps) {
  const t = await getTranslations()
  const params = await searchParams
  const q = typeof params.q === 'string' ? params.q : undefined

  const [currentUser, feedsResult] = await Promise.all([
    getCurrentUser(),
    getRssFeeds({
      searchParams: {
        feed_type: 'podcast',
        discoverable: true,
        q,
        enabled: true,
        limit: 50,
      },
    }).catch(error => {
      const message = getListSearchErrorMessage(error)
      if (!message) throw error
      return { error: message }
    }),
  ])

  const hasSearchError = isListSearchErrorResult(feedsResult)
  const searchError = hasSearchError ? feedsResult.error : null
  const feeds = hasSearchError ? null : feedsResult

  const bookmarks = feeds?.bookmarks ?? {}
  const topicElections = feeds?.topic_elections ?? {}
  const electionVotes = feeds?.election_votes ?? {}

  const breadcrumbItems = buildBreadcrumbsForPath('/podcasts', {
    isAuthenticated: !!currentUser,
    userRoles: currentUser?.roles ?? [],
    tail: [{ name: t('extracted.podcasts.page.podcasts_1a2b3c4e'), path: '/podcasts' }],
  })

  return (
    <PageWithAside showFooter={false}>
      <div className='space-y-4'>
        <AnonymousStructuredDataScript
          data={createCollectionPageSchema({
            title: 'Podcasts',
            description: 'Browse podcast shows on Voucha.',
            path: '/podcasts',
          })}
        />
        {breadcrumbItems.length > 0 && (
          <AnonymousStructuredDataScript data={createBreadcrumbSchema(breadcrumbItems, t)} />
        )}
        {feeds && (
          <AnonymousStructuredDataScript
            data={createItemListSchema(
              feeds.results.slice(0, 10).map(feed => ({
                name: feed.title,
                url: feed.home_page_url?.url ?? feed.rss_feed_url.url,
              })),
              'Podcasts',
            )}
          />
        )}
        <Breadcrumbs items={breadcrumbItems} />
        <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
          <BrowsePageHeader routeKey='podcasts' />
          <AddSourceButton kind='podcast' />
        </div>

        <div
          className='space-y-4'
          data-pw='podcasts-list'
        >
          {searchError && (
            <ListSearchError
              t={t}
              message={searchError}
            />
          )}
          {feeds && feeds.results.length === 0 && (
            <EmptyState
              title={t('extracted.podcasts.page.noPodcastsFound_db2eb9ae')}
              description={
                q
                  ? t('extracted.podcasts.page.noPodcastsMatchYourSearchTryAdjusting_2b3c4d5f')
                  : t('extracted.podcasts.page.noPodcastFeedsHaveBeenAddedYet_3c4d5e60')
              }
              icon='search'
            />
          )}
          {feeds &&
            feeds.results.map(feed => (
              <RssFeedListItem
                key={feed.id}
                feed={feed}
                isFollowing={bookmarks[feed.id]?.follow === true}
                isFollowingTopic={bookmarks[feed.topic.id]?.follow === true}
                topicElection={feed.topic ? topicElections[feed.topic.id] : undefined}
                electionVoteChoice={
                  feed.topic
                    ? (electionVotes[feed.topic.id]?.choice as
                        | import('@/lib/api/client/elections').SentimentChoice
                        | undefined)
                    : undefined
                }
              />
            ))}
        </div>
      </div>
    </PageWithAside>
  )
}
