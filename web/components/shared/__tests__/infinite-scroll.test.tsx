import { describe, expect, it, vi } from 'vitest'

import { act, fireEvent, render, screen } from '@testing-library/react'

import { InfiniteScroll } from '../infinite-scroll'

import { setupInfiniteScrollObserverHarness } from '@/test-helpers/infinite-scroll-observer-harness'

describe('InfiniteScroll', () => {
  const { mockObserve, rafCallbacks, flushRaf, triggerIntersection, triggerScroll } =
    setupInfiniteScrollObserverHarness()

  it('renders children', () => {
    const { getByText } = render(
      <InfiniteScroll
        itemCount={1}
        hasNextPage={false}
        endCursor={null}
        onLoadMore={vi.fn<VitestLooseMock>()}
      >
        <div>content</div>
      </InfiniteScroll>,
    )
    expect(getByText('content')).toBeInTheDocument()
  })

  it('does not observe when hasNextPage is false', () => {
    render(
      <InfiniteScroll
        itemCount={1}
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
        itemCount={1}
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
        itemCount={1}
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
        itemCount={1}
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
        itemCount={1}
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
          itemCount={1}
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
        itemCount={1}
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
})
