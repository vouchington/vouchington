import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { act, render } from '@testing-library/react'

import { InfiniteScroll } from '../infinite-scroll'

describe('InfiniteScroll', () => {
  let intersectionCallback: IntersectionObserverCallback

  const mockObserve = vi.fn<VitestLooseMock>()

  const mockUnobserve = vi.fn<VitestLooseMock>()

  const mockDisconnect = vi.fn<VitestLooseMock>()

  // requestAnimationFrame mock: captures callbacks so tests can control when they fire
  const rafCallbacks = new Map<number, FrameRequestCallback>()

  let rafIdCounter = 0

  const mockRaf = vi.fn<VitestLooseMock>().mockImplementation((cb: FrameRequestCallback) => {
    const id = ++rafIdCounter
    rafCallbacks.set(id, cb)
    return id
  })

  const mockCancelRaf = vi.fn<VitestLooseMock>().mockImplementation((id: number) => {
    rafCallbacks.delete(id)
  })

  beforeEach(() => {
    rafCallbacks.clear()
    vi.stubGlobal('requestAnimationFrame', mockRaf)
    vi.stubGlobal('cancelAnimationFrame', mockCancelRaf)

    class MockIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        intersectionCallback = callback
      }
      observe = mockObserve
      unobserve = mockUnobserve
      disconnect = mockDisconnect
    }
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)

    // Default: page is scrollable (content taller than viewport) so the scroll
    // gate stays closed until the user explicitly scrolls.
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1000)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    mockObserve.mockClear()
    mockUnobserve.mockClear()
    mockDisconnect.mockClear()
    mockRaf.mockClear()
    mockCancelRaf.mockClear()
  })

  /** Run all pending requestAnimationFrame callbacks. */
  function flushRaf() {
    const cbs = [...rafCallbacks.values()]
    rafCallbacks.clear()
    for (const cb of cbs) cb(performance.now())
  }

  function triggerIntersection(isIntersecting: boolean) {
    intersectionCallback(
      [{ isIntersecting } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    )
  }

  /** Open the scroll gate (simulates first user scroll). */
  function triggerScroll() {
    window.dispatchEvent(new Event('scroll'))
  }

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
    const onLoadMore = vi
      .fn<() => Promise<void>>()
      .mockImplementation(() => new Promise<void>(r => (resolveLoad = r)))

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

  it('observes the sentinel element when hasNextPage is true', () => {
    render(
      <InfiniteScroll
        hasNextPage
        endCursor='cursor1'
        onLoadMore={vi.fn<VitestLooseMock>()}
      >
        <div>content</div>
      </InfiniteScroll>,
    )
    flushRaf()
    expect(mockObserve).toHaveBeenCalledOnce()
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
      .mockImplementationOnce(() => new Promise(resolve => (resolveFirstLoad = resolve)))
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
