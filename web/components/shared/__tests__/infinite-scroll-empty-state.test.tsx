import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { InfiniteScroll } from '../infinite-scroll'

describe('InfiniteScroll empty state', () => {
  let intersect: () => void

  beforeEach(() => {
    class ImmediateObserver {
      constructor(callback: IntersectionObserverCallback) {
        intersect = () =>
          callback(
            [{ isIntersecting: true } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          )
      }
      observe = vi.fn<VitestLooseMock>()
      unobserve = vi.fn<VitestLooseMock>()
      disconnect = vi.fn<VitestLooseMock>()
    }
    vi.stubGlobal('IntersectionObserver', ImmediateObserver)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    // A tall document keeps the scroll gate closed unless the list is empty.
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(100_000)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  function renderList(options: {
    itemCount: number
    hasNextPage: boolean
    endCursor: string | null
    onLoadMore?: () => Promise<boolean>
  }) {
    return render(
      <InfiniteScroll
        hasNextPage={options.hasNextPage}
        endCursor={options.endCursor}
        onLoadMore={options.onLoadMore ?? (async () => true)}
        itemCount={options.itemCount}
        emptyState={<p>Nothing here</p>}
      >
        <p>Row</p>
      </InfiniteScroll>,
    )
  }

  it('keeps paging an empty list that has a next page and a cursor', () => {
    const onLoadMore = vi.fn<() => Promise<boolean>>().mockResolvedValue(true)
    const { container } = renderList({
      itemCount: 0,
      hasNextPage: true,
      endCursor: 'c1',
      onLoadMore,
    })

    act(() => intersect())

    expect(screen.queryByText('Nothing here')).toBeNull()
    expect(container.querySelector('[data-pw="infinite-scroll-sentinel"]')).not.toBeNull()
    expect(onLoadMore).toHaveBeenCalledTimes(1)
  })

  it('shows the empty state when there is no next page', () => {
    const { container } = renderList({ itemCount: 0, hasNextPage: false, endCursor: null })

    expect(screen.getByText('Nothing here')).toBeDefined()
    expect(container.querySelector('[data-pw="infinite-scroll-sentinel"]')).toBeNull()
  })

  it('shows the empty state when a next page has no cursor to request it with', () => {
    renderList({ itemCount: 0, hasNextPage: true, endCursor: null })

    expect(screen.getByText('Nothing here')).toBeDefined()
  })

  it('preserves list controls when it has no rows or replacement empty state', () => {
    render(
      <InfiniteScroll
        itemCount={0}
        hasNextPage={false}
        endCursor={null}
        onLoadMore={async () => true}
      >
        <button type='button'>Add row</button>
      </InfiniteScroll>,
    )

    expect(screen.getByRole('button', { name: 'Add row' })).toBeVisible()
  })

  it('keeps paging a short non-empty page and waits for a scroll', () => {
    const onLoadMore = vi.fn<() => Promise<boolean>>().mockResolvedValue(true)
    const { container } = renderList({
      itemCount: 1,
      hasNextPage: true,
      endCursor: 'c1',
      onLoadMore,
    })

    act(() => intersect())

    expect(screen.getByText('Row')).toBeDefined()
    expect(screen.queryByText('Nothing here')).toBeNull()
    expect(onLoadMore).not.toHaveBeenCalled()
    expect(container.querySelector('[data-pw="infinite-scroll-sentinel"]')).not.toBeNull()
  })
})
