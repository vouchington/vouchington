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

const headerDetails = <div data-testid='header-details'>source · date</div>

const actionSlot = <div data-testid='action-slot'>actions</div>

describe('RssFeedItemModalShell', () => {
  beforeEach(() => {
    mockNav.reset()
    mockNav.setSearchParams('rss_item=item-1')
    mockNav.setPathname('/news')
    mockNavContext = null
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

  describe('title external-link icon', () => {
    it('renders an ExternalLink icon inside the title anchor when titleUrl is provided', () => {
      render(
        <RssFeedItemModalShell
          {...DEFAULT_PROPS}
          title='Test Article'
          titleUrl='https://example.com/article'
        >
          <div>content</div>
        </RssFeedItemModalShell>,
      )

      // Dialog renders via a portal to document.body, not inside container
      const titleAnchor = document.querySelector('a[href="https://example.com/article"]')
      expect(titleAnchor).not.toBeNull()
      const svgIcon = titleAnchor?.querySelector('svg')
      expect(svgIcon).not.toBeNull()
      // The icon must trail the text — last element child in the anchor
      expect(titleAnchor?.lastElementChild?.tagName.toLowerCase()).toBe('svg')
    })

    it('does not render an anchor or icon when titleUrl is absent', () => {
      render(
        <RssFeedItemModalShell
          {...DEFAULT_PROPS}
          title='No Link Article'
        >
          <div>content</div>
        </RssFeedItemModalShell>,
      )

      // Title text renders as plain text with no wrapping anchor when titleUrl is absent
      const titleEl = screen.getByText('No Link Article')
      expect(titleEl.closest('a')).toBeNull()
    })
  })
})
