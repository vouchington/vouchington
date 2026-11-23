import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'

interface InfiniteScrollTestDoubleProps {
  children: ReactNode
  isEmpty?: boolean
  emptyState?: ReactNode
  hasNextPage: boolean
  fetchError?: Error | null
  onLoadMore: () => Promise<void | boolean>
  clearError?: () => void
}

export function InfiniteScroll({
  children,
  isEmpty,
  emptyState,
  hasNextPage,
  fetchError,
  onLoadMore,
  clearError,
}: InfiniteScrollTestDoubleProps) {
  return (
    <>
      {isEmpty ? (hasNextPage ? null : emptyState) : children}
      {hasNextPage ? (
        <>
          <Button
            type='button'
            data-pw='test-manual-continuation'
            onClick={() => {
              if (fetchError) clearError?.()
              void onLoadMore()
            }}
          >
            {fetchError ? 'Retry' : 'Load more'}
          </Button>
          <Button
            type='button'
            data-pw='test-auto-continuation'
            onClick={() => void onLoadMore()}
          >
            Auto load
          </Button>
        </>
      ) : null}
    </>
  )
}
