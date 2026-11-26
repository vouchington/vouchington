import { describe, expect, it, vi } from 'vitest'

import { act, fireEvent, render, screen } from '@testing-library/react'

import { InfiniteScroll } from '../infinite-scroll'

import { setupInfiniteScrollObserverHarness } from '@/test-helpers/infinite-scroll-observer-harness'

describe('InfiniteScroll', () => {
  const { mockObserve, mockDisconnect, flushRaf, triggerIntersection, triggerScroll } =
    setupInfiniteScrollObserverHarness()

  it('uses the same guarded action for the Load more button and intersection', () => {
    let resolveLoad!: () => void
    const onLoadMore = vi.fn<() => Promise<void>>().mockImplementation(
      () =>
        new Promise<void>(resolve => {
          resolveLoad = resolve
        }),
    )

    render(
      <InfiniteScroll
        itemCount={1}
        hasNextPage
        endCursor='cursor1'
        loadingMore={false}
        fetchError={null}
        clearError={vi.fn<VitestLooseMock>()}
        onLoadMore={onLoadMore}
      >
        <div>content</div>
      </InfiniteScroll>,
    )

    flushRaf()
    triggerScroll()
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    act(() => triggerIntersection(true))

    expect(onLoadMore).toHaveBeenCalledOnce()
    resolveLoad()
  })

  it('stops automatic continuation after a failure and allows manual retry', async () => {
    const onLoadMore = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const clearError = vi.fn<() => void>()
    const { rerender } = render(
      <InfiniteScroll
        itemCount={1}
        hasNextPage
        endCursor='cursor1'
        loadingMore={false}
        fetchError={null}
        clearError={clearError}
        onLoadMore={onLoadMore}
      >
        <div>content</div>
      </InfiniteScroll>,
    )

    flushRaf()
    triggerScroll()
    await act(async () => triggerIntersection(true))

    rerender(
      <InfiniteScroll
        itemCount={1}
        hasNextPage
        endCursor='cursor1'
        loadingMore={false}
        fetchError={new Error('network failure')}
        clearError={clearError}
        onLoadMore={onLoadMore}
      >
        <div>content</div>
      </InfiniteScroll>,
    )
    await act(async () => triggerIntersection(true))
    expect(onLoadMore).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(clearError).toHaveBeenCalledOnce()
    expect(onLoadMore).toHaveBeenCalledTimes(2)
  })

  it('keeps a retry button for errors after the final page is loaded', () => {
    const onLoadMore = vi.fn<VitestLooseMock>().mockResolvedValue(undefined)
    const clearError = vi.fn<VitestLooseMock>()
    render(
      <InfiniteScroll
        itemCount={1}
        hasNextPage={false}
        endCursor={null}
        fetchError={new Error('refresh failed')}
        clearError={clearError}
        onLoadMore={onLoadMore}
      >
        <div>content</div>
      </InfiniteScroll>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(clearError).toHaveBeenCalledOnce()
    expect(onLoadMore).toHaveBeenCalledOnce()
  })

  it('re-observes the sentinel when resetKey changes even if hasNextPage, endCursor, and fetchError are unchanged', () => {
    const onLoadMore = vi.fn<VitestLooseMock>().mockResolvedValue(undefined)
    const { rerender } = render(
      <InfiniteScroll
        itemCount={1}
        hasNextPage
        endCursor='cursor1'
        onLoadMore={onLoadMore}
        resetKey='key1'
      >
        <div>content</div>
      </InfiniteScroll>,
    )
    flushRaf()
    expect(mockObserve).toHaveBeenCalledOnce()

    // Same hasNextPage/endCursor/fetchError as before — only resetKey changes. Without
    // resetKey in the observer effect's deps, this would not re-observe, and a sentinel
    // that stays fully visible across the change would never get a fresh intersection
    // check to retrigger a load for the new query.
    rerender(
      <InfiniteScroll
        itemCount={1}
        hasNextPage
        endCursor='cursor1'
        onLoadMore={onLoadMore}
        resetKey='key2'
      >
        <div>content</div>
      </InfiniteScroll>,
    )
    flushRaf()

    expect(mockDisconnect).toHaveBeenCalledOnce()
    expect(mockObserve).toHaveBeenCalledTimes(2)
  })
})
