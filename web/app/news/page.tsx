import { Suspense } from 'react'
import type { Metadata } from 'next'
import { getRssFeedItems } from '@/lib/api/server'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { createPageMetadata } from '@/lib/seo/metadata'
import {
  createBreadcrumbSchema,
  createCollectionPageSchema,
  createItemListSchema,
} from '@/lib/seo/structured-data'
import { AnonymousStructuredDataScript } from '@/components/seo/anonymous-structured-data-script'
import { NewsFilters } from '@/components/news/news-filters'
import { FeedViewToggle } from '@/components/feed/feed-view-toggle'
import { NewsItemClusterList } from '@/components/news/news-item-cluster-list'
import { RssFeedItemModal } from '@/components/rss-feed-items/rss-feed-item-modal'
import { DiscoveryAsides } from '@/components/asides/discovery-asides'
import { PageWithAside } from '@/components/page-with-aside'
import { ListSearchError } from '@/components/shared/list-search-error'
import { getListSearchErrorMessage, isListSearchErrorResult } from '@/lib/api/list-search-error'
import { getTranslations } from '@/lib/i18n/get-translations'
import { BrowsePageHeader } from '@/components/shared/browse-page-header'
import { AddSourceButton } from '@/components/sources/add-source-button'
import { joinSearchParamValues } from '@/lib/search-param-values'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'

export const dynamic = 'force-dynamic'
const NEWS_PAGE_LIMIT = 25

function NewsPageAside() {
  return (
    <Suspense fallback={null}>
      <DiscoveryAsides />
    </Suspense>
  )
}

export const metadata: Metadata = createPageMetadata({
  title: 'News',
  description: 'Latest news from across the web on the topics you follow.',
  path: '/news',
})

interface NewsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function NewsPage({ searchParams }: NewsPageProps) {
  const t = await getTranslations()
  const params = await searchParams
  const q = typeof params.q === 'string' ? params.q : undefined
  const topics = joinSearchParamValues(params.topics)
  const queryParams = {
    ...(q ? { q } : {}),
    ...(topics ? { topics } : {}),
    media_type: 'article',
    limit: NEWS_PAGE_LIMIT,
  }
  const [currentUser, newsDataResult] = await Promise.all([
    getCurrentUser(),
    getRssFeedItems({
      searchParams: queryParams,
    }).catch(error => {
      const message = getListSearchErrorMessage(error)
      if (!message) throw error
      return { error: message }
    }),
  ])
  const hasSearchError = isListSearchErrorResult(newsDataResult)
  const searchError = hasSearchError ? newsDataResult.error : null
  const newsData = hasSearchError ? null : newsDataResult

  const breadcrumbItems = buildBreadcrumbsForPath('/news', {
    isAuthenticated: !!currentUser,
    userRoles: currentUser?.roles ?? [],
    tail: [{ name: 'News', path: '/news' }],
  })

  return (
    <PageWithAside aside={NewsPageAside}>
      <div
        className='space-y-4'
        data-pw='localization-tmux-smoke-news-page'
      >
        <AnonymousStructuredDataScript
          data={createCollectionPageSchema({
            title: 'News',
            description: 'Latest news from across the web on the topics you follow.',
            path: '/news',
          })}
        />
        {breadcrumbItems.length > 0 && (
          <AnonymousStructuredDataScript data={createBreadcrumbSchema(breadcrumbItems, t)} />
        )}
        <AnonymousStructuredDataScript
          data={createItemListSchema(
            (newsData?.results ?? [])
              .slice(0, 10)
              .reduce<{ name: string; url: string }[]>((acc, result) => {
                const item = newsData?.rss_feed_items[result.entity_id ?? result.id]
                if (item !== undefined)
                  acc.push({ name: item.data.title ?? item.rss_feed.title, url: item.url.url })
                return acc
              }, []),
            'News',
          )}
        />
        <Breadcrumbs items={breadcrumbItems} />
        <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
          <BrowsePageHeader
            routeKey='news'
            titleClassName='text-2xl tracking-tight'
          />
          <AddSourceButton kind='news' />
        </div>
        <div className='flex flex-wrap items-start justify-between gap-2 sm:items-center'>
          <NewsFilters />
          <FeedViewToggle />
        </div>
        {newsData ? (
          <NewsItemClusterList
            data={newsData}
            nextPageEndpoint='/api/v1/rss-feed-items'
            nextPageParams={{
              ...queryParams,
            }}
          >
            <RssFeedItemModal
              pathname='/news'
              searchParams={params}
            />
          </NewsItemClusterList>
        ) : (
          <ListSearchError
            t={t}
            message={searchError ?? 'Search failed'}
          />
        )}
      </div>
    </PageWithAside>
  )
}
