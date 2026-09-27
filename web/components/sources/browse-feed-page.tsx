import type { MessageKey } from '@ts-shared/ui-messages'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { EmptyState } from '@/components/shared/empty-state'
import { ListSearchError } from '@/components/shared/list-search-error'
import { RssFeedListItem } from '@/components/sources/rss-feed-list-item'
import { getRssFeeds } from '@/lib/api/server/rss-feeds'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getListSearchErrorMessage, isListSearchErrorResult } from '@/lib/api/list-search-error'
import {
  createBreadcrumbSchema,
  createCollectionPageSchema,
  createItemListSchema,
} from '@/lib/seo/structured-data'
import { AnonymousStructuredDataScript } from '@/components/seo/anonymous-structured-data-script'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { PageWithAside } from '@/components/page-with-aside'
import { BrowsePageHeader, type BrowseRouteKey } from '@/components/shared/browse-page-header'
import { AddSourceButton } from '@/components/sources/add-source-button'
import type { AddSourceKind } from '@/components/sources/add-source-content'
import { getTranslations } from '@/lib/i18n/get-translations'
import type { SentimentChoice } from '@/lib/api/client/elections'
import type { ViewRssFeed } from '@/types/rss-feeds'

export interface BrowseFeedPageConfig {
  searchParams: Promise<Record<string, string | string[] | undefined>>
  feedType: 'video' | 'article' | 'podcast'
  path: '/channels' | '/news-sources' | '/podcasts'
  title: string
  collectionDescription: string
  listName: string
  routeKey: Extract<BrowseRouteKey, 'channels' | 'news-sources' | 'podcasts'>
  sourceKind: AddSourceKind
  listTestId?: 'channels-list' | 'news-sources-list' | 'podcasts-list'
  breadcrumb: { kind: 'literal'; name: string } | { kind: 'message'; key: MessageKey }
  emptyTitleKey: MessageKey
  emptySearchKey: MessageKey
  emptyDefaultKey: MessageKey
  showFooter: boolean
  includeHostnameElections: boolean
  itemTitle: 'title' | 'title-or-topic'
}

function itemName(feed: ViewRssFeed, itemTitle: BrowseFeedPageConfig['itemTitle']): string {
  if (itemTitle === 'title') return feed.title
  return feed.title ?? feed.topic?.name ?? 'Unknown'
}

export async function BrowseFeedPage({
  listTestId = 'channels-list',
  ...config
}: BrowseFeedPageConfig) {
  const t = await getTranslations()
  const params = await config.searchParams
  const q = typeof params.q === 'string' ? params.q : undefined

  const [currentUser, feedsResult] = await Promise.all([
    getCurrentUser(),
    getRssFeeds({
      searchParams: {
        feed_type: config.feedType,
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
  const breadcrumbName =
    config.breadcrumb.kind === 'message' ? t(config.breadcrumb.key) : config.breadcrumb.name

  const breadcrumbItems = buildBreadcrumbsForPath(config.path, {
    isAuthenticated: !!currentUser,
    userRoles: currentUser?.roles ?? [],
    tail: [{ name: breadcrumbName, path: config.path }],
  })

  const bookmarks = feeds?.bookmarks ?? {}
  const hostnameElections = feeds?.hostname_elections ?? {}
  const topicElections = feeds?.topic_elections ?? {}
  const electionVotes = feeds?.election_votes ?? {}

  return (
    <PageWithAside showFooter={config.showFooter}>
      <div className='space-y-4'>
        <AnonymousStructuredDataScript
          data={createCollectionPageSchema({
            title: config.title,
            description: config.collectionDescription,
            path: config.path,
          })}
        />
        {breadcrumbItems.length > 0 && (
          <AnonymousStructuredDataScript data={createBreadcrumbSchema(breadcrumbItems, t)} />
        )}
        {feeds && (
          <AnonymousStructuredDataScript
            data={createItemListSchema(
              feeds.results.slice(0, 10).map(feed => ({
                name: itemName(feed, config.itemTitle),
                url: feed.home_page_url?.url ?? feed.rss_feed_url.url,
              })),
              config.listName,
            )}
          />
        )}
        <Breadcrumbs items={breadcrumbItems} />
        <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
          <BrowsePageHeader routeKey={config.routeKey} />
          <AddSourceButton kind={config.sourceKind} />
        </div>

        <div
          className='space-y-4'
          data-pw={listTestId}
        >
          {searchError && (
            <ListSearchError
              t={t}
              message={searchError}
            />
          )}
          {feeds && feeds.results.length === 0 && (
            <EmptyState
              title={t(config.emptyTitleKey)}
              description={q ? t(config.emptySearchKey) : t(config.emptyDefaultKey)}
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
                  config.includeHostnameElections && feed.hostname?.id
                    ? hostnameElections[feed.hostname.id]
                    : undefined
                }
                topicElection={feed.topic ? topicElections[feed.topic.id] : undefined}
                electionVoteChoice={
                  feed.topic
                    ? (electionVotes[feed.topic.id]?.choice as SentimentChoice | undefined)
                    : undefined
                }
              />
            ))}
        </div>
      </div>
    </PageWithAside>
  )
}
