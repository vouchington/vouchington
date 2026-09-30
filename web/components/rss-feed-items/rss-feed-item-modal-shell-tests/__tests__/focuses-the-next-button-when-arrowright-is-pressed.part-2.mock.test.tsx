import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
// Imported after the nav mock so its vi.mock factory can reference navMockModule.
import { focusRssFeedItemModalButtonAfterKey } from '@/test-helpers/components/rss-feed-items/modal-keyboard-focus'
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
      const nextButton = focusRssFeedItemModalButtonAfterKey({
        buttonName: /next/i,
        initial: {
          currentItemId: 'item-1',
          nextUrl: '/news?rss_item=item-2',
          previousUrl: '/news?rss_item=prev',
        },
        key: 'ArrowRight',
        next: {
          currentItemId: 'item-2',
          nextUrl: '/news?rss_item=item-3',
          previousUrl: '/news?rss_item=item-1',
        },
      })

      expect(document.activeElement).toBe(nextButton)
    })

    it('re-focuses the Previous button via rAF when currentItemId changes after ArrowLeft', () => {
      // The previous button is aria-disabled here (no prev URL) but still focusable.
      const prevButton = focusRssFeedItemModalButtonAfterKey({
        buttonName: /previous/i,
        initial: {
          currentItemId: 'item-2',
          nextUrl: '/news?rss_item=item-3',
          previousUrl: '/news?rss_item=item-1',
        },
        key: 'ArrowLeft',
        next: {
          currentItemId: 'item-1',
          nextUrl: '/news?rss_item=item-2',
          previousUrl: null,
        },
      })

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
