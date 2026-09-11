import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
import { RssFeedItemModalShell } from '../../rss-feed-item-modal-shell'

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

const mockNav = createNavMock()
mockNav.setSearchParams('rss_item=item-1')
mockNav.setPathname('/news')

let mockNavContext: { orderedItemIds: string[] } | null = null

vi.mock(
  import('@/lib/rss-item-nav-context'),
  () =>
    ({
      useRssItemNav: () => mockNavContext,
    }) as unknown as typeof import('@/lib/rss-item-nav-context'),
)

const DEFAULT_PROPS = {
  closeUrl: '/news',
  currentItemId: 'item-1',
  title: 'Item',
} as const

describe('RssFeedItemModalShell keyboard navigation', () => {
  beforeEach(() => {
    mockNav.reset()
    mockNav.setSearchParams('rss_item=item-1')
    mockNav.setPathname('/news')
    mockNavContext = null
  })

  it('navigates to the previous item on ArrowLeft', () => {
    render(
      <RssFeedItemModalShell
        {...DEFAULT_PROPS}
        previousUrl='/news?rss_item=prev'
        nextUrl='/news?rss_item=next'
      >
        <div>content</div>
      </RssFeedItemModalShell>,
    )

    fireEvent.keyDown(window, { key: 'ArrowLeft' })

    expect(mockNav.push).toHaveBeenCalledWith('/news?rss_item=prev', { scroll: false })
  })

  it('navigates to the next item on ArrowRight', () => {
    render(
      <RssFeedItemModalShell
        {...DEFAULT_PROPS}
        previousUrl='/news?rss_item=prev'
        nextUrl='/news?rss_item=next'
      >
        <div>content</div>
      </RssFeedItemModalShell>,
    )

    fireEvent.keyDown(window, { key: 'ArrowRight' })

    expect(mockNav.push).toHaveBeenCalledWith('/news?rss_item=next', { scroll: false })
  })

  it('focuses the Previous button when ArrowLeft is pressed', () => {
    render(
      <RssFeedItemModalShell
        {...DEFAULT_PROPS}
        previousUrl='/news?rss_item=prev'
        nextUrl='/news?rss_item=next'
      >
        <div>content</div>
      </RssFeedItemModalShell>,
    )

    const prevButton = screen.getByRole('button', { name: /previous/i })
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(prevButton)
  })

  describe('rAF-based focus recovery after currentItemId changes', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('re-focuses the Next button via rAF when currentItemId changes after ArrowRight', () => {
      vi.useFakeTimers({ toFake: ['requestAnimationFrame'] })

      const { rerender } = render(
        <RssFeedItemModalShell
          {...DEFAULT_PROPS}
          currentItemId='item-1'
          previousUrl='/news?rss_item=prev'
          nextUrl='/news?rss_item=item-2'
        >
          <div>content</div>
        </RssFeedItemModalShell>,
      )

      // ArrowRight sets pendingFocusDirectionRef to 'next'
      fireEvent.keyDown(window, { key: 'ArrowRight' })

      // Simulate navigation completing: re-render with a new currentItemId
      rerender(
        <RssFeedItemModalShell
          {...DEFAULT_PROPS}
          currentItemId='item-2'
          previousUrl='/news?rss_item=item-1'
          nextUrl='/news?rss_item=item-3'
        >
          <div>content</div>
        </RssFeedItemModalShell>,
      )

      const nextButton = screen.getByRole('button', { name: /next/i })

      // Flush the rAF scheduled by the useEffect
      vi.runAllTimers()

      expect(document.activeElement).toBe(nextButton)
    })

    it('re-focuses the Previous button via rAF when currentItemId changes after ArrowLeft', () => {
      vi.useFakeTimers({ toFake: ['requestAnimationFrame'] })

      const { rerender } = render(
        <RssFeedItemModalShell
          {...DEFAULT_PROPS}
          currentItemId='item-2'
          previousUrl='/news?rss_item=item-1'
          nextUrl='/news?rss_item=item-3'
        >
          <div>content</div>
        </RssFeedItemModalShell>,
      )

      // ArrowLeft sets pendingFocusDirectionRef to 'previous'
      fireEvent.keyDown(window, { key: 'ArrowLeft' })

      // Simulate navigation completing: re-render with a new currentItemId.
      // The previous button is aria-disabled here (no prev URL) but still focusable.
      rerender(
        <RssFeedItemModalShell
          {...DEFAULT_PROPS}
          currentItemId='item-1'
          previousUrl={null}
          nextUrl='/news?rss_item=item-2'
        >
          <div>content</div>
        </RssFeedItemModalShell>,
      )

      const prevButton = screen.getByRole('button', { name: /previous/i })

      // Flush the rAF scheduled by the useEffect
      vi.runAllTimers()

      expect(document.activeElement).toBe(prevButton)
    })
  })

  it('uses context nav when RssItemNavProvider is present', () => {
    mockNavContext = { orderedItemIds: ['prev-id', 'item-1', 'next-id'] }
    mockNav.setSearchParams('rss_item=item-1')

    render(
      <RssFeedItemModalShell
        {...DEFAULT_PROPS}
        previousUrl='/news?rss_item=url-prev'
        nextUrl='/news?rss_item=url-next'
      >
        <div>content</div>
      </RssFeedItemModalShell>,
    )

    // Context provides prev/next; buttons should be enabled
    const prevButton = screen.getByRole('button', { name: /previous/i })
    const nextButton = screen.getByRole('button', { name: /next/i })
    expect(prevButton).toBeDefined()
    expect(nextButton).toBeDefined()
    expect(prevButton.hasAttribute('disabled')).toBe(false)
    expect(nextButton.hasAttribute('disabled')).toBe(false)
  })

  it('uses context nav even without rss_item_nav in URL', () => {
    mockNavContext = { orderedItemIds: ['prev-id', 'item-1', 'next-id'] }
    mockNav.setSearchParams('rss_item=item-1')
    render(
      <RssFeedItemModalShell {...DEFAULT_PROPS}>
        <div>content</div>
      </RssFeedItemModalShell>,
    )

    fireEvent.keyDown(window, { key: 'ArrowRight' })

    expect(mockNav.push).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /previous/i })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(screen.getByRole('button', { name: /next/i })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('disables stale URL fallback nav when the current item is absent from visible context', () => {
    mockNavContext = { orderedItemIds: ['visible-item'] }
    mockNav.setSearchParams('rss_item=item-1')
    render(
      <RssFeedItemModalShell
        {...DEFAULT_PROPS}
        previousUrl='/news?rss_item=prev-id'
        nextUrl='/news?rss_item=next-id'
      >
        <div>content</div>
      </RssFeedItemModalShell>,
    )

    fireEvent.keyDown(window, { key: 'ArrowRight' })

    expect(mockNav.push).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /previous/i })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(screen.getByRole('button', { name: /next/i })).toHaveAttribute('aria-disabled', 'true')
  })
})
