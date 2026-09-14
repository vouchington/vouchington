import { Suspense } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getRssFeedItems } from '@/lib/api/server'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getEffectiveServerFeatureFlag } from '@/lib/feature-flags/server'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
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
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'
const PAGE_LIMIT = 25

function VideosPageAside() {
  return (
    <Suspense fallback={null}>
      <DiscoveryAsides />
    </Suspense>
  )
}

export const metadata: Metadata = createPageMetadata({
  title: 'Videos',
  description: 'Latest videos from the channels you follow.',
  path: '/videos',
})

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function VideosPage({ searchParams }: PageProps) {
  const t = await getTranslations()
  const params = await searchParams
  const q = typeof params.q === 'string' ? params.q : undefined
  const queryParams = {
    ...(q ? { q } : {}),
    media_type: 'video',
    limit: PAGE_LIMIT,
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
  const fediverseEnabled = await getEffectiveServerFeatureFlag('fediverse')
  const hasSearchError = isListSearchErrorResult(dataResult)
  const searchError = hasSearchError ? dataResult.error : null
  const data = hasSearchError ? null : dataResult

  const breadcrumbItems = buildBreadcrumbsForPath('/videos', {
    isAuthenticated: !!currentUser,
    userRoles: currentUser?.roles ?? [],
    tail: [{ name: 'Videos', path: '/videos' }],
  })

  return (
    <PageWithAside aside={VideosPageAside}>
      <div className='space-y-4'>
        <AnonymousStructuredDataScript
          data={createCollectionPageSchema({
            title: 'Videos',
            description: 'Latest videos from the channels you follow.',
            path: '/videos',
          })}
        />
        {breadcrumbItems.length > 0 && (
          <AnonymousStructuredDataScript data={createBreadcrumbSchema(breadcrumbItems, t)} />
        )}
        <AnonymousStructuredDataScript
          data={createItemListSchema(
            (data?.results ?? [])
              .slice(0, 10)
              .reduce<{ name: string; url: string }[]>((acc, result) => {
                const item = data?.rss_feed_items[result.entity_id ?? result.id]
                if (item !== undefined)
                  acc.push({ name: item.data.title ?? item.rss_feed.title, url: item.url.url })
                return acc
              }, []),
            'Videos',
          )}
        />
        <Breadcrumbs items={breadcrumbItems} />
        <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
          <BrowsePageHeader
            routeKey='videos'
            titleClassName='text-2xl tracking-tight'
          />
          <div className='flex flex-wrap gap-2'>
            {fediverseEnabled ? (
              <Button
                asChild
                variant='outline'
              >
                <Link href='/fediverse?provider=peertube'>Search PeerTube</Link>
              </Button>
            ) : null}
            <AddSourceButton kind='video' />
          </div>
        </div>
        <div className='flex flex-wrap items-start justify-between gap-2 sm:items-center'>
          <NewsFilters />
          <FeedViewToggle />
        </div>
        {data ? (
          <NewsItemClusterList
            data={data}
            nextPageEndpoint='/api/v1/rss-feed-items'
            nextPageParams={{
              ...queryParams,
            }}
          >
            <RssFeedItemModal
              pathname='/videos'
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
