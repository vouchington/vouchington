import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'

interface InfiniteScrollTestDoubleProps {
  children: ReactNode
  hasNextPage: boolean
  fetchError?: Error | null
  onLoadMore: () => Promise<void | boolean>
  clearError?: () => void
}

export function InfiniteScroll({
  children,
  hasNextPage,
  fetchError,
  onLoadMore,
  clearError,
}: InfiniteScrollTestDoubleProps) {
  return (
    <>
      {children}
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
