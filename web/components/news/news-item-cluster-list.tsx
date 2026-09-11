'use client'

import type { ReactNode } from 'react'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { EmptyState } from '@/components/shared/empty-state'
import { useFeedStyle } from '@/lib/preferences/use-feed-style'
import type { PaginatedListParams } from '@/hooks/use-paginated-list'
import type { RssFeedItemsFeedResponseBody } from '@/types/rss-feed-items'
import { RssItemNavProvider } from '@/lib/rss-item-nav-provider'
import { NewsItemClusterListRow } from './news-item-cluster-list-row'
import { useNewsItemClusters } from './use-news-item-clusters'
import type { NewsCommunityDiscussionTarget } from './community-discussion-types'
import { useTranslations } from '@/lib/i18n/use-translations'

interface NewsItemClusterListProps {
  data: RssFeedItemsFeedResponseBody
  nextPageEndpoint?: string
  nextPageParams?: PaginatedListParams
  emptyState?: ReactNode
  children?: ReactNode
  modal?: ReactNode
  communityDiscussionTarget?: NewsCommunityDiscussionTarget
}

const EMPTY_PAGE_PARAMS: PaginatedListParams = {}

export function NewsItemClusterList({
  data,
  nextPageEndpoint = '',
  nextPageParams = EMPTY_PAGE_PARAMS,
  emptyState,
  children,
  modal,
  communityDiscussionTarget,
}: NewsItemClusterListProps) {
  const t = useTranslations()
  const { feedStyle } = useFeedStyle()
  const news = useNewsItemClusters(data, nextPageEndpoint, nextPageParams)
  const canLoadMore = news.hasNextPage && Boolean(nextPageEndpoint)
  const emptyContent =
    emptyState === undefined ? (
      <EmptyState
        title={t('extracted.news.newsItemClusterList.noNewsFound_1cb8f117')}
        description={t('extracted.news.newsItemClusterList.noNewsArticlesYet_c05d40fc')}
        icon='inbox'
      />
    ) : (
      emptyState
    )

  return (
    <RssItemNavProvider
      orderedItemIds={news.orderedItemIds}
      hasNextPage={canLoadMore}
      loadingMore={news.loadingMore}
      onLoadMore={news.handleLoadMore}
    >
      {news.allResults.length === 0 ? (
        emptyContent
      ) : (
        <InfiniteScroll
          hasNextPage={canLoadMore}
          endCursor={news.endCursor}
          onLoadMore={news.handleLoadMore}
          loadingMore={news.loadingMore}
          fetchError={news.fetchError}
          clearError={news.clearError}
          resetKey={news.resetKey}
        >
          <div className='space-y-4'>
            {news.visibleClusters.map(cluster => (
              <NewsItemClusterListRow
                key={cluster.primaryResult.id}
                allBookmarks={news.allBookmarks}
                allElectionVotes={news.allElectionVotes}
                allElections={news.allElections}
                allPosts={news.allPosts}
                allRelatedPostsByUrlId={news.allRelatedPostsByUrlId}
                allStories={news.allStories}
                allStoryPostIds={news.allStoryPostIds}
                allThumbnailUrls={news.allThumbnailUrls}
                allEmbeds={news.allEmbeds}
                allUsers={news.allUsers}
                cluster={cluster}
                communityDiscussionTarget={communityDiscussionTarget}
                expandedStoryIds={news.expandedStoryIds}
                feedStyle={feedStyle}
                onExpandedStoryIdsChange={news.handleExpandedStoryIdsChange}
              />
            ))}
          </div>
        </InfiniteScroll>
      )}
      {modal === undefined ? children : modal}
    </RssItemNavProvider>
  )
}
