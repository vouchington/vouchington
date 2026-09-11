import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

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
    // Unmount before clearing mocks: the global setup's afterEach also calls cleanup(), but
    // registration order runs it after this describe's afterEach, so a still-mounted component's
    // effect-cleanup disconnect() would otherwise be counted against the *next* test instead of
    // this one.
    cleanup()
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

  it('uses the same guarded action for the Load more button and intersection', () => {
    let resolveLoad!: () => void
    const onLoadMore = vi
      .fn<() => Promise<void>>()
      .mockImplementation(() => new Promise<void>(resolve => (resolveLoad = resolve)))

    render(
      <InfiniteScroll
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

  it('re-observes the sentinel when resetKey changes even if hasNextPage, endCursor, and fetchError are unchanged', () => {
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
    flushRaf()
    expect(mockObserve).toHaveBeenCalledOnce()

    // Same hasNextPage/endCursor/fetchError as before — only resetKey changes. Without
    // resetKey in the observer effect's deps, this would not re-observe, and a sentinel
    // that stays fully visible across the change would never get a fresh intersection
    // check to retrigger a load for the new query.
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
    flushRaf()

    expect(mockDisconnect).toHaveBeenCalledOnce()
    expect(mockObserve).toHaveBeenCalledTimes(2)
  })
})
