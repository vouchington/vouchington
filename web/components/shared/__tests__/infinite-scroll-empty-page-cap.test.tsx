import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { InfiniteScroll } from '../infinite-scroll'
import { MAX_CONSECUTIVE_EMPTY_PAGES } from '../use-consecutive-empty-pages'

describe('InfiniteScroll consecutive empty pages', () => {
  let intersect: () => void
  const onLoadMore = vi.fn<() => Promise<boolean>>()

  beforeEach(() => {
    onLoadMore.mockReset().mockResolvedValue(true)
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
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(100_000)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  function list(page: number, isEmpty = true) {
    return (
      <InfiniteScroll
        hasNextPage
        endCursor={`cursor-${page}`}
        onLoadMore={onLoadMore}
        isEmpty={isEmpty}
        emptyState={<p>Nothing here</p>}
      >
        <p>Row</p>
      </InfiniteScroll>
    )
  }

  // Delivers the empty page `page` (cursor-`page`) and lets the sentinel intersect.
  async function arriveAndIntersect(view: ReturnType<typeof render>, page: number, empty = true) {
    view.rerender(list(page, empty))
    await act(async () => intersect())
  }

  async function walkEmptyPages(view: ReturnType<typeof render>, from: number, count: number) {
    for (let page = from; page < from + count; page += 1) await arriveAndIntersect(view, page)
  }

  it('stops auto-loading after the cap and resumes on a click, resetting the count', async () => {
    const view = render(list(1))
    await act(async () => intersect())
    await walkEmptyPages(view, 2, MAX_CONSECUTIVE_EMPTY_PAGES - 1)

    // Pages 1..5 were empty: pages 1..4 requested the next one, page 5 did not.
    expect(onLoadMore).toHaveBeenCalledTimes(MAX_CONSECUTIVE_EMPTY_PAGES - 1)
    await act(async () => intersect())
    expect(onLoadMore).toHaveBeenCalledTimes(MAX_CONSECUTIVE_EMPTY_PAGES - 1)
    expect(screen.queryByText('Nothing here')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await act(async () => undefined)
    expect(onLoadMore).toHaveBeenCalledTimes(MAX_CONSECUTIVE_EMPTY_PAGES)

    // Auto-loading is back for up to the cap's worth of further empty pages.
    const before = onLoadMore.mock.calls.length
    await walkEmptyPages(view, MAX_CONSECUTIVE_EMPTY_PAGES + 1, MAX_CONSECUTIVE_EMPTY_PAGES)
    expect(onLoadMore).toHaveBeenCalledTimes(before + MAX_CONSECUTIVE_EMPTY_PAGES - 1)
  })

  it('resets the count when a page adds results', async () => {
    const view = render(list(1))
    await act(async () => intersect())
    await walkEmptyPages(view, 2, MAX_CONSECUTIVE_EMPTY_PAGES - 2)
    const before = onLoadMore.mock.calls.length

    view.rerender(list(MAX_CONSECUTIVE_EMPTY_PAGES, false))
    expect(screen.getByText('Row')).toBeDefined()

    // Empty again (a new query's first page): the full cap is available once more.
    const next = MAX_CONSECUTIVE_EMPTY_PAGES + 1
    await arriveAndIntersect(view, next)
    await walkEmptyPages(view, next + 1, MAX_CONSECUTIVE_EMPTY_PAGES - 1)
    expect(onLoadMore).toHaveBeenCalledTimes(before + MAX_CONSECUTIVE_EMPTY_PAGES - 1)
  })

  it('does not count the same page twice', async () => {
    const view = render(list(1))
    for (let i = 0; i < MAX_CONSECUTIVE_EMPTY_PAGES + 2; i += 1) {
      view.rerender(list(1))
    }
    await act(async () => intersect())

    expect(onLoadMore).toHaveBeenCalledTimes(1)
  })
})
