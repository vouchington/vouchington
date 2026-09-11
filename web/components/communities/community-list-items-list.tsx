'use client'

import { usePaginatedList } from '@/hooks/use-paginated-list'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { EmptyState } from '@/components/shared/empty-state'
import { CommunityListItemCard } from './community-list-item-card'
import { mergePageResultsById } from '@ts-shared/utils/collections'
import type { CommunityListItemType, CommunityListPageData } from '@/types/api-responses'
import { useTranslations } from '@/lib/i18n/use-translations'

interface CommunityListItemsListProps {
  initialData: CommunityListPageData
  endpoint: string
  itemType: CommunityListItemType
  communitySlug: string
  canManage?: boolean
}

export function CommunityListItemsList({
  initialData,
  endpoint,
  itemType,
  communitySlug,
  canManage = false,
}: CommunityListItemsListProps) {
  const t = useTranslations()
  const { pages, hasNextPage, endCursor, loadMore, loadingMore, fetchError, clearError, resetKey } =
    usePaginatedList(initialData, endpoint, {})

  const mergedData = mergePages(pages)
  const items = mergedData.results.flatMap(r =>
    mergedData.community_list_items[r.id] != null ? [mergedData.community_list_items[r.id]!] : [],
  )

  if (items.length === 0) {
    return (
      <EmptyState
        icon='inbox'
        title={t('extracted.communities.communityListItemsList.noItemsYet_2e5bdbbd')}
        description={t(
          'extracted.communities.communityListItemsList.noItemsHaveBeenAddedTo_fe8e8105',
        )}
      />
    )
  }

  return (
    <InfiniteScroll
      hasNextPage={hasNextPage}
      endCursor={endCursor}
      onLoadMore={loadMore}
      loadingMore={loadingMore}
      fetchError={fetchError}
      clearError={clearError}
      resetKey={resetKey}
    >
      <div className='space-y-3'>
        {items.map(item => (
          <CommunityListItemCard
            key={item.id}
            item={item}
            itemType={itemType}
            data={mergedData}
            communitySlug={communitySlug}
            canManage={canManage}
          />
        ))}
      </div>
    </InfiniteScroll>
  )
}

function mergePages(pages: CommunityListPageData[]): CommunityListPageData {
  const last = pages.at(-1)!
  const merged: CommunityListPageData = {
    page_info: last.page_info,
    results: [],
    community_list_items: {},
    topics: {},
    topics_metrics: {},
    rss_feeds: {},
    posts: {},
    posts_metrics: {},
    url_hostnames: {},
    urls: {},
  }

  merged.results = mergePageResultsById(pages)
  for (const page of pages) {
    Object.assign(merged.community_list_items, page.community_list_items)
    if (page.topics) Object.assign(merged.topics!, page.topics)
    if (page.topics_metrics) Object.assign(merged.topics_metrics!, page.topics_metrics)
    if (page.rss_feeds) Object.assign(merged.rss_feeds!, page.rss_feeds)
    if (page.posts) Object.assign(merged.posts!, page.posts)
    if (page.posts_metrics) Object.assign(merged.posts_metrics!, page.posts_metrics)
    if (page.url_hostnames) Object.assign(merged.url_hostnames!, page.url_hostnames)
    if (page.urls) Object.assign(merged.urls!, page.urls)
  }

  return merged
}
