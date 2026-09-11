import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
import { RssFeedItemModalShell } from '../../rss-feed-item-modal-shell'

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

const mockNav = createNavMock()
mockNav.setSearchParams('rss_item=item-1')
mockNav.setPathname('/news')
const mockScrollIntoView = vi.fn<VitestLooseMock>()
const originalScrollIntoView = Element.prototype.scrollIntoView

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

describe('RssFeedItemModalShell rendering', () => {
  beforeEach(() => {
    mockNav.reset()
    mockNav.setSearchParams('rss_item=item-1')
    mockNav.setPathname('/news')
    mockScrollIntoView.mockReset()
    Element.prototype.scrollIntoView = mockScrollIntoView
    mockNavContext = null
  })

  afterEach(() => {
    if (originalScrollIntoView) {
      Element.prototype.scrollIntoView = originalScrollIntoView
    } else {
      delete (Element.prototype as { scrollIntoView?: Element['scrollIntoView'] }).scrollIntoView
    }
  })

  it('marks previous and next buttons as aria-disabled when no navigation context exists', () => {
    render(
      <RssFeedItemModalShell {...DEFAULT_PROPS}>
        <div>content</div>
      </RssFeedItemModalShell>,
    )

    expect(screen.getByRole('button', { name: /previous/i })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(screen.getByRole('button', { name: /next/i })).toHaveAttribute('aria-disabled', 'true')
  })

  it('renders title as a link when titleUrl is provided', () => {
    render(
      <RssFeedItemModalShell
        {...DEFAULT_PROPS}
        title='Article Title'
        titleUrl='https://example.com/article'
      >
        <div>content</div>
      </RssFeedItemModalShell>,
    )

    const titleLink = screen.getByRole('link', { name: 'Article Title' })
    expect(titleLink).toBeDefined()
    expect(titleLink.getAttribute('href')).toBe('https://example.com/article')
    expect(titleLink.getAttribute('target')).toBe('_blank')
    expect(titleLink.getAttribute('rel')).toContain('noopener')
  })

  it('renders title as plain text when titleUrl is not provided', () => {
    render(
      <RssFeedItemModalShell
        {...DEFAULT_PROPS}
        title='Plain Title'
      >
        <div>content</div>
      </RssFeedItemModalShell>,
    )

    expect(screen.getByText('Plain Title')).toBeDefined()
    // No anchor wrapping the title
    const links = screen.queryAllByRole('link', { name: 'Plain Title' })
    expect(links).toHaveLength(0)
  })

  it('renders title as plain text when titleUrl has a non-http(s) scheme', () => {
    const scriptUrl = `javascript:alert(1)`
    render(
      <RssFeedItemModalShell
        {...DEFAULT_PROPS}
        title='Unsafe Title'
        titleUrl={scriptUrl}
      >
        <div>content</div>
      </RssFeedItemModalShell>,
    )

    expect(screen.getByText('Unsafe Title')).toBeDefined()
    // No anchor must be rendered for unsafe schemes
    const links = screen.queryAllByRole('link', { name: 'Unsafe Title' })
    expect(links).toHaveLength(0)
  })

  it('renders Previous/Next buttons after the content in DOM order', () => {
    render(
      <RssFeedItemModalShell
        {...DEFAULT_PROPS}
        previousUrl='/news?rss_item=prev'
        nextUrl='/news?rss_item=next'
      >
        <div data-testid='article-content'>article</div>
      </RssFeedItemModalShell>,
    )

    const content = screen.getByTestId('article-content')
    const prev = screen.getByRole('button', { name: /previous/i })

    // Previous button must come after the content in DOM order
    expect(content.compareDocumentPosition(prev) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('renders DialogDescription as sr-only regardless of props', () => {
    render(
      <RssFeedItemModalShell {...DEFAULT_PROPS}>
        <div>content</div>
      </RssFeedItemModalShell>,
    )

    // The description element should exist but be visually hidden
    const description = screen.getByText('RSS item detail')
    expect(description.className).toContain('sr-only')
  })

  it('keeps the dialog and scroll area horizontally constrained', () => {
    render(
      <RssFeedItemModalShell {...DEFAULT_PROPS}>
        <div data-testid='article-content'>article</div>
      </RssFeedItemModalShell>,
    )

    const dialog = screen.getByRole('dialog')
    expect(dialog.className).toContain('w-[calc(100vw-1rem)]')
    expect(dialog.className).toContain('min-w-0')
    expect(dialog.className).toContain('overflow-hidden')

    const article = screen.getByTestId('article-content')
    const scrollArea = article.closest('.min-w-0')
    expect(scrollArea).not.toBeNull()
  })

  it('keeps the modal header left-aligned on mobile', () => {
    render(
      <RssFeedItemModalShell
        {...DEFAULT_PROPS}
        title='A very long title that should wrap instead of centering on mobile'
        titleUrl='https://example.com/article'
      >
        <div>content</div>
      </RssFeedItemModalShell>,
    )

    const title = document.querySelector<HTMLElement>('[data-pw="rss-feed-item-modal-title"]')
    expect(title).not.toBeNull()
    expect(title!.className).toContain('text-left')
    expect(title!.parentElement?.className).toContain('text-left')
    const titleLink = document.querySelector<HTMLElement>(
      '[data-pw="rss-feed-item-modal-title-link"]',
    )
    expect(titleLink).not.toBeNull()
    expect(titleLink!.className).toContain('[overflow-wrap:anywhere]')
  })

  it('renders nav buttons as siblings of ScrollArea, not nested inside it', () => {
    render(
      <RssFeedItemModalShell
        {...DEFAULT_PROPS}
        previousUrl='/news?rss_item=prev'
        nextUrl='/news?rss_item=next'
      >
        <div data-testid='article-content'>article</div>
      </RssFeedItemModalShell>,
    )

    const prev = screen.getByRole('button', { name: /previous/i })
    const next = screen.getByRole('button', { name: /next/i })
    const article = screen.getByTestId('article-content')
    const scrollArea = article.closest('.min-h-0')

    // Nav buttons must NOT be descendants of the ScrollArea — they are siblings of it
    // in the DialogContent flex column. This is the structural invariant: scroll only
    // the article body; keep the nav row pinned outside the scroll container.
    expect(scrollArea).not.toBeNull()
    expect(scrollArea!.contains(prev)).toBe(false)
    expect(scrollArea!.contains(next)).toBe(false)
  })

  it('does not scroll the underlying page on initial modal open', async () => {
    render(
      <>
        <article data-rss-item-id='item-1'>card</article>
        <RssFeedItemModalShell {...DEFAULT_PROPS}>
          <div>content</div>
        </RssFeedItemModalShell>
      </>,
    )

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined()
    })
    expect(mockScrollIntoView).not.toHaveBeenCalled()
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
