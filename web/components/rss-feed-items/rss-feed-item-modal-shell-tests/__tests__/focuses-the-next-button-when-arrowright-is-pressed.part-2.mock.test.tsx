import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { navMockModule, createNavMock } from 'vouchington-tooling/next-navigation-mock'
// Imported after the nav mock so its vi.mock factory can reference navMockModule.
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
