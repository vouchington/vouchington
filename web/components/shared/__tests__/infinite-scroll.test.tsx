import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { act, fireEvent, render, screen } from '@testing-library/react'

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

  it('renders children', () => {
    const { getByText } = render(
      <InfiniteScroll
        hasNextPage={false}
        endCursor={null}
        onLoadMore={vi.fn<VitestLooseMock>()}
      >
        <div>content</div>
      </InfiniteScroll>,
    )
    expect(getByText('content')).toBeDefined()
  })

  it('does not observe when hasNextPage is false', () => {
    render(
      <InfiniteScroll
        hasNextPage={false}
        endCursor={null}
        onLoadMore={vi.fn<VitestLooseMock>()}
      >
        <div>content</div>
      </InfiniteScroll>,
    )
    flushRaf()
    expect(mockObserve).not.toHaveBeenCalled()
  })

  it('defers observer.observe() until requestAnimationFrame fires', () => {
    render(
      <InfiniteScroll
        hasNextPage
        endCursor='cursor1'
        onLoadMore={vi.fn<VitestLooseMock>()}
      >
        <div>content</div>
      </InfiniteScroll>,
    )
    expect(mockObserve).not.toHaveBeenCalled()
    flushRaf()
    expect(mockObserve).toHaveBeenCalledOnce()
  })

  it('cancels the pending requestAnimationFrame on cleanup before it fires', () => {
    const { unmount } = render(
      <InfiniteScroll
        hasNextPage
        endCursor='cursor1'
        onLoadMore={vi.fn<VitestLooseMock>()}
      >
        <div>content</div>
      </InfiniteScroll>,
    )
    expect(rafCallbacks.size).toBe(1)
    unmount()
    expect(rafCallbacks.size).toBe(0)
    expect(mockObserve).not.toHaveBeenCalled()
  })

  it('does not call onLoadMore when sentinel is visible but user has not scrolled', async () => {
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
    await act(async () => {
      triggerIntersection(true)
    })

    expect(onLoadMore).not.toHaveBeenCalled()
  })

  it('calls onLoadMore when sentinel is visible and user has scrolled', async () => {
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

    expect(onLoadMore).toHaveBeenCalledOnce()
  })

  it('opens the scroll gate for a nested scroll container without loading eagerly', async () => {
    const onLoadMore = vi.fn<VitestLooseMock>().mockResolvedValue(undefined)
    render(
      <div data-testid='nested-scroll-container'>
        <InfiniteScroll
          hasNextPage
          endCursor='cursor1'
          onLoadMore={onLoadMore}
        >
          <div>content</div>
        </InfiniteScroll>
      </div>,
    )

    flushRaf()
    await act(async () => triggerIntersection(true))
    expect(onLoadMore).not.toHaveBeenCalled()

    fireEvent.scroll(screen.getByTestId('nested-scroll-container'))
    await act(async () => triggerIntersection(true))

    expect(onLoadMore).toHaveBeenCalledOnce()
  })

  it('auto-loads on initial render when page content does not fill the viewport', async () => {
    // Short result set: scrollHeight < innerHeight — scroll event can never fire.
    // The RAF callback detects this and opens the gate immediately.
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(100)

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
    await act(async () => {
      triggerIntersection(true)
    })

    expect(onLoadMore).toHaveBeenCalledOnce()
  })

  it('calls onLoadMore when sentinel becomes visible', async () => {
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

    expect(onLoadMore).toHaveBeenCalledOnce()
  })
})
