import type { ComponentProps } from 'react'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { CategoryList } from './category-list'
import type { usePaginatedList } from '@/hooks/use-paginated-list'
import type { ListResponse } from '@/types/api-responses'
import type { SpendingCategory } from '@/types/my'

interface Props extends ComponentProps<typeof CategoryList> {
  pagination: ReturnType<typeof usePaginatedList<ListResponse<SpendingCategory>>>
}

export function CategoryListPagination({ pagination, ...categoryListProps }: Props) {
  const handleLoadMore = pagination.loadMore
  return (
    <InfiniteScroll
      hasNextPage={pagination.hasNextPage}
      endCursor={pagination.endCursor}
      onLoadMore={handleLoadMore}
      loadingMore={pagination.loadingMore}
      fetchError={pagination.fetchError}
      clearError={pagination.clearError}
      resetKey={pagination.resetKey}
    >
      <CategoryList {...categoryListProps} />
    </InfiniteScroll>
  )
}
