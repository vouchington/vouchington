import { Suspense, type ReactNode } from 'react'
import { DiscoveryAsides } from '@/components/asides/discovery-asides'
import {
  MediaItemListingView,
  type MediaItemListingDataPw,
  type MediaItemListingPath,
  type MediaItemListingRouteKey,
} from '@/components/feed/media-item-listing-view'
import { NewsItemClusterList } from '@/components/news/news-item-cluster-list'
import { RssFeedItemModal } from '@/components/rss-feed-items/rss-feed-item-modal'
import { ListSearchError } from '@/components/shared/list-search-error'
import { getListSearchErrorMessage, isListSearchErrorResult } from '@/lib/api/list-search-error'
import { getRssFeedItems } from '@/lib/api/server'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getTranslations } from '@/lib/i18n/get-translations'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { joinSearchParamValues } from '@/lib/search-param-values'
import {
  createBreadcrumbSchema,
  createCollectionPageSchema,
  createItemListSchema,
  type ItemListInput,
} from '@/lib/seo/structured-data'
import type { RssFeedItemsFeedResponseBody } from '@/types/rss-feed-items'

const MEDIA_ITEM_LISTING_LIMIT = 25
const NEXT_PAGE_ENDPOINT = '/api/v1/rss-feed-items'

export interface MediaItemListingPageConfig {
  searchParams: Promise<Record<string, string | string[] | undefined>>
  mediaType: 'article' | 'audio' | 'video'
  path: MediaItemListingPath
  title: string
  description: string
  routeKey: MediaItemListingRouteKey
  includeTopics?: boolean
  dataPw?: MediaItemListingDataPw
  headerActions: () => ReactNode | Promise<ReactNode>
}

function MediaItemListingAside() {
  return (
    <Suspense fallback={null}>
      <DiscoveryAsides />
    </Suspense>
  )
}

function mediaItemListEntries(data: RssFeedItemsFeedResponseBody | null): ItemListInput[] {
  return (data?.results ?? []).slice(0, 10).reduce<ItemListInput[]>((acc, result) => {
    const item = data?.rss_feed_items[result.entity_id ?? result.id]
    if (item !== undefined)
      acc.push({ name: item.data.title ?? item.rss_feed.title, url: item.url.url })
    return acc
  }, [])
}

export async function MediaItemListingPage(config: MediaItemListingPageConfig) {
  const t = await getTranslations()
  const params = await config.searchParams
  const q = typeof params.q === 'string' ? params.q : undefined
  const topics = config.includeTopics ? joinSearchParamValues(params.topics) : undefined
  const queryParams = {
    ...(q ? { q } : {}),
    ...(topics ? { topics } : {}),
    media_type: config.mediaType,
    limit: MEDIA_ITEM_LISTING_LIMIT,
  }
  const [currentUser, dataResult] = await Promise.all([
    getCurrentUser(),
    getRssFeedItems({
      searchParams: queryParams,
    }).catch(error => {
      const message = getListSearchErrorMessage(error)
      if (!message) throw error
      return { error: message }
    }),
  ])
  const headerActions = await config.headerActions()
  const hasSearchError = isListSearchErrorResult(dataResult)
  const searchError = hasSearchError ? dataResult.error : null
  const data = hasSearchError ? null : dataResult
  const breadcrumbItems = buildBreadcrumbsForPath(config.path, {
    isAuthenticated: !!currentUser,
    userRoles: currentUser?.roles ?? [],
    tail: [{ name: config.title, path: config.path }],
  })

  return (
    <MediaItemListingView
      aside={MediaItemListingAside}
      collectionSchema={createCollectionPageSchema({
        title: config.title,
        description: config.description,
        path: config.path,
      })}
      breadcrumbSchema={
        breadcrumbItems.length > 0 ? createBreadcrumbSchema(breadcrumbItems, t) : null
      }
      itemListSchema={createItemListSchema(mediaItemListEntries(data), config.title)}
      breadcrumbItems={breadcrumbItems}
      routeKey={config.routeKey}
      headerActions={headerActions}
      dataPw={config.dataPw}
      feed={
        data ? (
          <NewsItemClusterList
            data={data}
            nextPageEndpoint={NEXT_PAGE_ENDPOINT}
            nextPageParams={{
              ...queryParams,
            }}
          >
            <RssFeedItemModal
              pathname={config.path}
              searchParams={params}
            />
          </NewsItemClusterList>
        ) : (
          <ListSearchError
            t={t}
            message={searchError ?? 'Search failed'}
          />
        )
      }
    />
  )
}
