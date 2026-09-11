/**
 * Feed news list page component (Server Component)
 * Fetches RSS feed items and renders tabs, sub-filters, and list
 */
import type { ReactNode } from 'react'
import { getRssFeedItemsFeed } from '@/lib/api/server'
import { FeedTopSection } from './feed-top-section'
import { FeedViewToggle } from './feed-view-toggle'
import { NewsFilters } from '@/components/news/news-filters'
import { NewsItemClusterList } from '@/components/news/news-item-cluster-list'
import { ListSearchError } from '@/components/shared/list-search-error'
import { FEED_PAGE_LIMIT } from '@/lib/feed-route-configs'
import { RssFeedItemModal } from '@/components/rss-feed-items/rss-feed-item-modal'
import { getListSearchErrorMessage, isListSearchErrorResult } from '@/lib/api/list-search-error'
import { getTranslations } from '@/lib/i18n/get-translations'
import { type MediaFeedRouteConfig, getMediaFeedEmptyState } from './feed-media-empty-states'

interface FeedNewsListPageProps {
  config: MediaFeedRouteConfig
  searchParams: Record<string, string | string[] | undefined>
  action?: ReactNode
}

const mediaTypeByCategory: Record<MediaFeedRouteConfig['category'], string> = {
  news: 'article',
  podcasts: 'audio',
  videos: 'video',
}

export async function FeedNewsListPage({ config, searchParams, action }: FeedNewsListPageProps) {
  const t = await getTranslations()
  const endpoint = `/api/v1/feeds/rss_feed_items/${config.feedType}`
  const query = typeof searchParams.q === 'string' ? searchParams.q : undefined
  const mediaType = mediaTypeByCategory[config.category]
  const queryParams = {
    limit: FEED_PAGE_LIMIT,
    ...(query ? { q: query } : {}),
    ...(mediaType ? { media_type: mediaType } : {}),
  }
  const dataResult = await getRssFeedItemsFeed(config.feedType, {
    searchParams: queryParams,
  }).catch(error => {
    const message = getListSearchErrorMessage(error)
    if (!message) throw error
    return { error: message }
  })
  const hasSearchError = isListSearchErrorResult(dataResult)
  const searchError = hasSearchError ? dataResult.error : null
  const data = hasSearchError ? null : dataResult

  const emptyState = getMediaFeedEmptyState(config.feedType, config.category)

  return (
    <div className='space-y-4'>
      <FeedTopSection
        category={config.category}
        activeFilterPath={config.path}
        filters={<NewsFilters />}
        viewToggle={<FeedViewToggle />}
        action={action}
      />
      {data ? (
        <NewsItemClusterList
          data={data}
          nextPageEndpoint={endpoint}
          nextPageParams={queryParams}
          emptyState={emptyState}
        >
          <RssFeedItemModal
            pathname={config.path}
            searchParams={searchParams}
          />
        </NewsItemClusterList>
      ) : (
        <ListSearchError
          t={t}
          message={searchError ?? 'Search failed'}
        />
      )}
    </div>
  )
}
