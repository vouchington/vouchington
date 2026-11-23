import { describe, expect, it, vi } from 'vitest'

import { act, render } from '@testing-library/react'

import { InfiniteScroll } from '../infinite-scroll'

import { setupInfiniteScrollObserverHarness } from '@/test-helpers/infinite-scroll-observer-harness'

describe('InfiniteScroll', () => {
  const { flushRaf, triggerIntersection, triggerScroll } = setupInfiniteScrollObserverHarness()

  it('does not call onLoadMore when not intersecting', async () => {
    const onLoadMore = vi.fn<VitestLooseMock>().mockResolvedValue(undefined)
    render(
      <InfiniteScroll
        hasNextPage
        endCursor='cursor1'
        onLoadMore={onLoadMore}
      >
        <div>content</div>
      </InfiniteScroll>,
    )

    flushRaf()
    triggerScroll()
    await act(async () => {
      triggerIntersection(false)
    })

    expect(onLoadMore).not.toHaveBeenCalled()
  })

  it('does not call onLoadMore a second time for the same cursor', async () => {
    const onLoadMore = vi.fn<VitestLooseMock>().mockResolvedValue(undefined)
    render(
      <InfiniteScroll
        hasNextPage
        endCursor='cursor1'
        onLoadMore={onLoadMore}
      >
        <div>content</div>
      </InfiniteScroll>,
    )

    flushRaf()
    triggerScroll()
    await act(async () => {
      triggerIntersection(true)
    })
    await act(async () => {
      triggerIntersection(true)
    })

    expect(onLoadMore).toHaveBeenCalledOnce()
  })

  it('retries the same cursor when onLoadMore reports it did not actually start', async () => {
    const onLoadMore = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce(false)
      .mockResolvedValue(undefined)
    render(
      <InfiniteScroll
        hasNextPage
        endCursor='cursor1'
        onLoadMore={onLoadMore}
      >
        <div>content</div>
      </InfiniteScroll>,
    )

    flushRaf()
    triggerScroll()
    await act(async () => {
      triggerIntersection(true)
    })
    await act(async () => {
      triggerIntersection(true)
    })

    expect(onLoadMore).toHaveBeenCalledTimes(2)
  })

  it('does not call onLoadMore concurrently while a load is in progress', async () => {
    let resolveLoad!: () => void
    const onLoadMore = vi.fn<() => Promise<void>>().mockImplementation(
      () =>
        new Promise<void>(r => {
          resolveLoad = r
        }),
    )

    render(
      <InfiniteScroll
        hasNextPage
        endCursor='cursor1'
        onLoadMore={onLoadMore}
      >
        <div>content</div>
      </InfiniteScroll>,
    )

    flushRaf()
    triggerScroll()

    // First trigger — starts the load (does not await, so loadingRef stays true)
    act(() => {
      triggerIntersection(true)
    })

    // Second trigger while first is still in flight
    act(() => {
      triggerIntersection(true)
    })

    expect(onLoadMore).toHaveBeenCalledOnce()

    // Cleanup
    resolveLoad()
  })

  it('fires onLoadMore again when resetKey changes with the same endCursor', async () => {
    const onLoadMore = vi.fn<VitestLooseMock>().mockResolvedValue(undefined)
    const { rerender } = render(
      <InfiniteScroll
        hasNextPage
        endCursor='cursor1'
        onLoadMore={onLoadMore}
        resetKey='key1'
      >
        <div>content</div>
      </InfiniteScroll>,
    )

    // Scroll once to open the gate (persists across rerenders of the same instance)
    flushRaf()
    triggerScroll()

    // First intersection: fires and marks cursor1 as loaded
    await act(async () => {
      triggerIntersection(true)
    })
    expect(onLoadMore).toHaveBeenCalledOnce()

    // Second intersection with same cursor: blocked by the loaded-cursor guard
    await act(async () => {
      triggerIntersection(true)
    })
    expect(onLoadMore).toHaveBeenCalledOnce()

    // Changing resetKey clears the loaded-cursor guard; same endCursor fires again
    rerender(
      <InfiniteScroll
        hasNextPage
        endCursor='cursor1'
        onLoadMore={onLoadMore}
        resetKey='key2'
      >
        <div>content</div>
      </InfiniteScroll>,
    )

    await act(async () => {
      triggerIntersection(true)
    })
    expect(onLoadMore).toHaveBeenCalledTimes(2)
  })

  it('does not let a stale in-flight request re-stamp the guard after resetKey changes', async () => {
    let resolveFirstLoad!: (started: boolean) => void
    const onLoadMore = vi
      .fn<VitestLooseMock>()
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveFirstLoad = resolve
          }),
      )
      .mockResolvedValue(undefined)
    const { rerender } = render(
      <InfiniteScroll
        hasNextPage
        endCursor='cursor1'
        onLoadMore={onLoadMore}
        resetKey='key1'
      >
        <div>content</div>
      </InfiniteScroll>,
    )

    flushRaf()
    triggerScroll()

    // Starts a load for cursor1 under the first query; leave it pending.
    act(() => {
      triggerIntersection(true)
    })
    expect(onLoadMore).toHaveBeenCalledOnce()

    // Query changes (e.g. filter change) while that load is still in flight. The new
    // query's first page coincidentally ends on the same cursor value.
    rerender(
      <InfiniteScroll
        hasNextPage
        endCursor='cursor1'
        onLoadMore={onLoadMore}
        resetKey='key2'
      >
        <div>content</div>
      </InfiniteScroll>,
    )

    // The stale request now resolves, reporting that it did start a request.
    await act(async () => {
      resolveFirstLoad(true)
    })

    // The guard must not have been re-stamped by the stale completion: the new query's
    // cursor1 has never actually been requested, so intersection must trigger a real load.
    await act(async () => {
      triggerIntersection(true)
    })
    expect(onLoadMore).toHaveBeenCalledTimes(2)
  })
})
