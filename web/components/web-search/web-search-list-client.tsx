'use client'

import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { EmptyState } from '@/components/shared/empty-state'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { WebSearchResultItem } from './web-search-result-item'
import type { WebSearchResponseBody } from '@/types/api-responses'
import { useTranslations } from '@/lib/i18n/use-translations'

interface WebSearchListClientProps {
  initialData: WebSearchResponseBody
  query: string
}

export function WebSearchListClient({ initialData, query }: WebSearchListClientProps) {
  const t = useTranslations()
  const { pages, hasNextPage, endCursor, loadMore, loadingMore, fetchError, clearError, resetKey } =
    usePaginatedList(initialData, '/api/v1/web-search', { query })

  const seen = new Set<string>()
  const results = []
  for (const page of pages) {
    for (const item of page.results) {
      if (!seen.has(item.url.id)) {
        seen.add(item.url.id)
        results.push(item)
      }
    }
  }

  if (results.length === 0) {
    return (
      <EmptyState
        icon='search'
        title={t('extracted.webSearch.webSearchListClient.noResultsFound_7d7e3605')}
        description={t('extracted.webSearch.webSearchListClient.tryADifferentSearchQuery_67989328')}
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
      <div className='divide-y divide-border overflow-hidden bg-card shadow-sm dark:shadow-none sm:rounded-lg'>
        <div className='px-4'>
          {results.map(result => (
            <WebSearchResultItem
              key={result.url.id}
              result={result}
            />
          ))}
        </div>
      </div>
    </InfiniteScroll>
  )
}
