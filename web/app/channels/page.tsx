export const dynamic = 'force-dynamic'

import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { EmptyState } from '@/components/shared/empty-state'
import { ListSearchError } from '@/components/shared/list-search-error'
import { RssFeedListItem } from '@/components/sources/rss-feed-list-item'
import { getRssFeeds } from '@/lib/api/server/rss-feeds'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getListSearchErrorMessage, isListSearchErrorResult } from '@/lib/api/list-search-error'
import { createPageMetadata } from '@/lib/seo/metadata'
import {
  createBreadcrumbSchema,
  createCollectionPageSchema,
  createItemListSchema,
} from '@/lib/seo/structured-data'
import { AnonymousStructuredDataScript } from '@/components/seo/anonymous-structured-data-script'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { PageWithAside } from '@/components/page-with-aside'
import { BrowsePageHeader } from '@/components/shared/browse-page-header'
import { AddSourceButton } from '@/components/sources/add-source-button'
import { getTranslations } from '@/lib/i18n/get-translations'

export const metadata = createPageMetadata({
  title: 'Channels',
  description: 'Discover video channels on Voucha.',
  path: '/channels',
})

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function ChannelsPage({ searchParams }: PageProps) {
  const t = await getTranslations()
  const params = await searchParams
  const q = typeof params.q === 'string' ? params.q : undefined

  const [currentUser, feedsResult] = await Promise.all([
    getCurrentUser(),
    getRssFeeds({
      searchParams: {
        feed_type: 'video',
        discoverable: true,
        enabled: true,
        q,
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

  const breadcrumbItems = buildBreadcrumbsForPath('/channels', {
    isAuthenticated: !!currentUser,
    userRoles: currentUser?.roles ?? [],
    tail: [{ name: 'Channels', path: '/channels' }],
  })

  const bookmarks = feeds?.bookmarks ?? {}
  const hostnameElections = feeds?.hostname_elections ?? {}
  const topicElections = feeds?.topic_elections ?? {}
  const electionVotes = feeds?.election_votes ?? {}

  return (
    <PageWithAside>
      <div className='space-y-4'>
        <AnonymousStructuredDataScript
          data={createCollectionPageSchema({
            title: 'Channels',
            description: 'Discover video channels on Voucha.',
            path: '/channels',
          })}
        />
        {breadcrumbItems.length > 0 && (
          <AnonymousStructuredDataScript data={createBreadcrumbSchema(breadcrumbItems)} />
        )}
        {feeds && (
          <AnonymousStructuredDataScript
            data={createItemListSchema(
              feeds.results.slice(0, 10).map(feed => ({
                name: feed.title ?? feed.topic?.name ?? 'Unknown',
                url: feed.home_page_url?.url ?? feed.rss_feed_url.url,
              })),
              'Channels',
            )}
          />
        )}
        <Breadcrumbs items={breadcrumbItems} />
        <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
          <BrowsePageHeader routeKey='channels' />
          <AddSourceButton kind='video' />
        </div>

        <div
          className='space-y-4'
          data-pw='channels-list'
        >
          {searchError && (
            <ListSearchError
              t={t}
              message={searchError}
            />
          )}
          {feeds && feeds.results.length === 0 && (
            <EmptyState
              title={t('extracted.channels.page.noChannelsFound_86350898')}
              description={
                q
                  ? t('extracted.channels.page.noChannelsMatchYourSearchTry_c640eb88')
                  : t('extracted.channels.page.noVideoChannelsHaveBeenAdded_19eb06b1')
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
                hostnameElection={
                  feed.hostname?.id ? hostnameElections[feed.hostname.id] : undefined
                }
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
