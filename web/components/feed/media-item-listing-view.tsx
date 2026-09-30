import type { ElementType, ReactNode } from 'react'
import { AnonymousStructuredDataScript } from '@/components/seo/anonymous-structured-data-script'
import { FeedViewToggle } from '@/components/feed/feed-view-toggle'
import { NewsFilters } from '@/components/news/news-filters'
import { PageWithAside } from '@/components/page-with-aside'
import { BrowsePageHeader, type BrowseRouteKey } from '@/components/shared/browse-page-header'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import type { StructuredDataValue } from '@/lib/seo/structured-data'
import type { BreadcrumbNavItem } from '@/lib/seo/structured-data-breadcrumbs'

export type MediaItemListingPath = '/news' | '/videos' | '/podcast-episodes'
export type MediaItemListingRouteKey = Extract<
  BrowseRouteKey,
  'news' | 'videos' | 'podcast-episodes'
>
export type MediaItemListingDataPw = 'localization-tmux-smoke-news-page'

export interface MediaItemListingViewProps {
  collectionSchema: StructuredDataValue
  breadcrumbSchema: StructuredDataValue | null
  itemListSchema: StructuredDataValue
  breadcrumbItems: BreadcrumbNavItem[]
  routeKey: MediaItemListingRouteKey
  headerActions: ReactNode
  feed: ReactNode
  aside: ElementType
  dataPw?: MediaItemListingDataPw
}

export function MediaItemListingView({
  collectionSchema,
  breadcrumbSchema,
  itemListSchema,
  breadcrumbItems,
  routeKey,
  headerActions,
  feed,
  aside,
  dataPw,
}: MediaItemListingViewProps) {
  const shell = (
    <>
      <AnonymousStructuredDataScript data={collectionSchema} />
      {breadcrumbSchema !== null && <AnonymousStructuredDataScript data={breadcrumbSchema} />}
      <AnonymousStructuredDataScript data={itemListSchema} />
      <Breadcrumbs items={breadcrumbItems} />
      <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
        <BrowsePageHeader
          routeKey={routeKey}
          titleClassName='text-2xl tracking-tight'
        />
        {headerActions}
      </div>
      <div className='flex flex-wrap items-start justify-between gap-2 sm:items-center'>
        <NewsFilters />
        <FeedViewToggle />
      </div>
      {feed}
    </>
  )
  const root =
    dataPw !== undefined ? (
      <div
        className='space-y-4'
        data-pw='localization-tmux-smoke-news-page'
      >
        {shell}
      </div>
    ) : (
      <div className='space-y-4'>{shell}</div>
    )

  return <PageWithAside aside={aside}>{root}</PageWithAside>
}
