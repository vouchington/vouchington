import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { InfiniteScroll } from '../infinite-scroll'
import { MAX_CONSECUTIVE_EMPTY_PAGES } from '../use-consecutive-empty-pages'
import { setupInfiniteScrollObserverHarness } from '@/test-helpers/infinite-scroll-observer-harness'

describe('InfiniteScroll consecutive empty pages', () => {
  const { flushRaf, triggerIntersection, triggerScroll } = setupInfiniteScrollObserverHarness()
  const onLoadMore = vi.fn<() => Promise<boolean>>()

  beforeEach(() => {
    onLoadMore.mockReset().mockResolvedValue(true)
  })

  async function intersect() {
    flushRaf()
    await act(async () => triggerIntersection(true))
  }

  function list(page: number, itemCount = 0, resetKey?: string) {
    return (
      <InfiniteScroll
        hasNextPage
        endCursor={`cursor-${page}`}
        onLoadMore={onLoadMore}
        itemCount={itemCount}
        resetKey={resetKey}
        emptyState={<p>Nothing here</p>}
      >
        <p>Row</p>
      </InfiniteScroll>
    )
  }

  // Delivers the empty page `page` (cursor-`page`) and lets the sentinel intersect.
  async function arriveAndIntersect(view: ReturnType<typeof render>, page: number, itemCount = 0) {
    view.rerender(list(page, itemCount))
    await intersect()
  }

  async function walkEmptyPages(
    view: ReturnType<typeof render>,
    from: number,
    count: number,
    itemCount = 0,
  ) {
    for (let page = from; page < from + count; page += 1) {
      await arriveAndIntersect(view, page, itemCount)
    }
  }

  it('stops auto-loading after the cap and resumes on a click, resetting the count', async () => {
    const view = render(list(1))
    await intersect()
    await walkEmptyPages(view, 2, MAX_CONSECUTIVE_EMPTY_PAGES - 1)

    // Pages 1..5 were empty: pages 1..4 requested the next one, page 5 did not.
    expect(onLoadMore).toHaveBeenCalledTimes(MAX_CONSECUTIVE_EMPTY_PAGES - 1)
    await intersect()
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
    await intersect()
    await walkEmptyPages(view, 2, MAX_CONSECUTIVE_EMPTY_PAGES - 2)

    await arriveAndIntersect(view, MAX_CONSECUTIVE_EMPTY_PAGES, 1)
    expect(screen.getByText('Row')).toBeInTheDocument()
    expect(onLoadMore).toHaveBeenCalledTimes(MAX_CONSECUTIVE_EMPTY_PAGES)

    const next = MAX_CONSECUTIVE_EMPTY_PAGES + 1
    await walkEmptyPages(view, next, MAX_CONSECUTIVE_EMPTY_PAGES, 1)
    expect(onLoadMore).toHaveBeenCalledTimes(2 * MAX_CONSECUTIVE_EMPTY_PAGES - 1)
  })

  it('can load again after a query reset that reuses the paused cursor', async () => {
    const view = render(list(1))
    await intersect()
    await walkEmptyPages(view, 2, MAX_CONSECUTIVE_EMPTY_PAGES - 1)
    expect(onLoadMore).toHaveBeenCalledTimes(MAX_CONSECUTIVE_EMPTY_PAGES - 1)

    view.rerender(list(MAX_CONSECUTIVE_EMPTY_PAGES, 0, 'new-query'))
    await intersect()

    expect(onLoadMore).toHaveBeenCalledTimes(MAX_CONSECUTIVE_EMPTY_PAGES)
  })

  it('does not count the same page twice', async () => {
    const view = render(list(1))
    for (let i = 0; i < MAX_CONSECUTIVE_EMPTY_PAGES + 2; i += 1) {
      view.rerender(list(1))
    }
    await intersect()

    expect(onLoadMore).toHaveBeenCalledTimes(1)
  })

  it('pauses after five pages add no visible rows even when earlier results remain', async () => {
    const view = render(list(1, 1))
    flushRaf()
    triggerScroll()
    await intersect()
    await walkEmptyPages(view, 2, 5, 1)

    expect(onLoadMore).toHaveBeenCalledTimes(5)
    expect(screen.getByText('Row')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Load more' })).toBeEnabled()
  })
})
