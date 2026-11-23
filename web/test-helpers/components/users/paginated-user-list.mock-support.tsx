import { vi } from 'vitest'

const { receiveLoadMore } = vi.hoisted(() => ({
  receiveLoadMore: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client'), () => ({
  getPaginatedPage: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/components/shared/infinite-scroll'), () => ({
  InfiniteScroll: ({
    children,
    clearError,
    emptyState,
    fetchError,
    hasNextPage,
    isEmpty,
    onLoadMore,
  }: React.PropsWithChildren<{
    emptyState?: React.ReactNode
    hasNextPage?: boolean
    isEmpty?: boolean
    clearError?: () => void
    fetchError?: Error | null
    onLoadMore: () => void
  }>) => {
    receiveLoadMore(onLoadMore)
    return (
      <div>
        {isEmpty ? (hasNextPage ? null : emptyState) : children}
        {fetchError ? (
          // ast-grep-ignore: web-no-raw-form-elements -- test double replaces the load-more control with a native button the tests click
          <button
            type='button'
            onClick={() => {
              clearError?.()
              onLoadMore()
            }}
          >
            Retry
          </button>
        ) : null}
      </div>
    )
  },
}))

export { receiveLoadMore }
