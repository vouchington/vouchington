import { mockLucideReact } from '@/test-helpers/lucide-icons'
import { describe, expect, it, vi } from 'vitest'
import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
import {
  makeRssFeedItem,
  makeRssFeedItemCategory,
  makeRssFeedItemTopic,
} from '@/test-helpers/api-responses'
import { render, screen } from '@testing-library/react'
import { NewsItemCard } from '../news-item-card'
import type { RssFeedItem } from '@/types/rss-feed-items'

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

const mockNav = createNavMock()
mockNav.setPathname('/feed/news')

const customFooter = <div data-testid='custom-footer'>Footer content</div>

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

vi.mock(import('lucide-react'), () =>
  mockLucideReact({
    Loader2: () => null,
    ChevronDown: () => null,
    ChevronUp: () => null,
    ExternalLink: () => null,
  }),
)

vi.mock(import('@/components/shared/follower-share-actions'), () => ({
  FollowerShareActions: () => null,
}))

vi.mock(import('@/components/feed/manage-categories-menu-item'), () => ({
  ManageCategoriesMenuItem: ({ entityId }: { entityId: string }) => (
    <button
      type='button'
      data-testid='manage-categories-menu-item'
      data-entity-id={entityId}
    >
      Manage categories
    </button>
  ),
}))

vi.mock(import('@/components/shared/report-menu-item'), () => ({
  ReportMenuItem: ({ entityType, entityId }: { entityType: string; entityId: string }) => (
    <button
      type='button'
      data-testid='report-menu-item'
      data-entity-type={entityType}
      data-entity-id={entityId}
    >
      Report
    </button>
  ),
}))

vi.mock(
  import('@/lib/auth/context'),
  () =>
    ({
      useAuth: () => ({ isAuthenticated: true }),
      useOptionalAuth: () => null,
    }) as unknown as typeof import('@/lib/auth/context'),
)

vi.mock(import('@/components/shared/shared-byline'), () => ({
  SharedByline: () => null,
}))

const MOCK_TOPIC = makeRssFeedItemTopic({ id: 'topic-id-1', name: 'Tech', slug: 'tech' })

const MOCK_ITEM: RssFeedItem = makeRssFeedItem({
  id: 'test-id-1',
  data: {
    title: 'Test Article',
  },
  url: { id: 'url-id-1', url: 'https://example.com/article' },
  rss_feed: {
    id: 'feed-id-1',
    topic: MOCK_TOPIC,
  },
})

describe('NewsItemCard', () => {
  it('renders the article title as an external link with rel="nofollow noopener noreferrer"', () => {
    render(<NewsItemCard item={MOCK_ITEM} />)

    const titleLink = screen.getByRole('link', { name: /Test Article/i })
    expect(titleLink).toHaveAttribute('rel', 'nofollow noopener noreferrer')
    expect(titleLink).toHaveAttribute(
      'href',
      'https://example.com/article?utm_source=voucha.ai&utm_medium=referral',
    )
    expect(titleLink).toHaveAttribute('target', '_blank')
  })

  it('links source badge to the source topic page', () => {
    render(<NewsItemCard item={MOCK_ITEM} />)

    const sourceLink = screen.getByRole('link', { name: 'Example Feed' })
    expect(sourceLink).toHaveAttribute('href', '/topic/tech/latest')
  })

  it('does not render "Subscribe to Source"', () => {
    render(<NewsItemCard item={MOCK_ITEM} />)

    expect(screen.queryByText(/subscribe to source/i)).toBeNull()
  })

  it('adds data-rss-item-id attribute to the card wrapper', () => {
    const { container } = render(<NewsItemCard item={MOCK_ITEM} />)

    const card = container.querySelector('[data-pw="news-item-card"]')
    expect(card?.getAttribute('data-rss-item-id')).toBe('test-id-1')
  })

  it('renders categories with resolved topics as linked badges', () => {
    const itemWithCategory: RssFeedItem = {
      ...MOCK_ITEM,
      categories: [
        makeRssFeedItemCategory({
          id: 'rel-1',
          category_text: 'tech',
          topic: MOCK_TOPIC,
          votes_score_net: 1,
        }),
      ],
    }
    render(<NewsItemCard item={itemWithCategory} />)

    const categoryLink = screen.getByRole('link', { name: 'Tech' })
    expect(categoryLink).toHaveAttribute('href', '/topic/tech/news')
  })

  it('renders categories without topic match as plain (unlinked) badges', () => {
    const itemWithCategory: RssFeedItem = {
      ...MOCK_ITEM,
      categories: [makeRssFeedItemCategory({ category_text: 'Security' })],
    }
    render(<NewsItemCard item={itemWithCategory} />)

    // The text renders as a badge but not a link
    expect(screen.getByText('Security')).toBeDefined()
    const links = screen.queryAllByRole('link', { name: 'Security' })
    expect(links).toHaveLength(0)
  })

  it('renders mixed categories: linked when topic exists, plain when null', () => {
    const itemWithCategories: RssFeedItem = {
      ...MOCK_ITEM,
      categories: [
        makeRssFeedItemCategory({
          id: 'rel-1',
          category_text: 'tech',
          topic: MOCK_TOPIC,
          votes_score_net: 1,
        }),
        makeRssFeedItemCategory({ category_text: 'Open Source' }),
      ],
    }
    render(<NewsItemCard item={itemWithCategories} />)

    expect(screen.getByRole('link', { name: 'Tech' })).toBeDefined()
    expect(screen.getByText('Open Source')).toBeDefined()
    expect(screen.queryAllByRole('link', { name: 'Open Source' })).toHaveLength(0)
  })

  it('renders footer slot inside the card', () => {
    const { container } = render(
      <NewsItemCard
        item={MOCK_ITEM}
        footer={customFooter}
      />,
    )

    const card = container.querySelector('[data-pw="news-item-card"]')
    const footer = screen.getByTestId('custom-footer')

    // Footer must be a descendant of the card
    expect(card?.contains(footer)).toBe(true)
  })

  it('does not render footer slot when not provided', () => {
    const { container } = render(<NewsItemCard item={MOCK_ITEM} />)

    // No extra CardContent rendered for footer
    expect(screen.queryByTestId('custom-footer')).toBeNull()
    // The card should still render without errors
    expect(container.querySelector('[data-pw="news-item-card"]')).not.toBeNull()
  })

  it('renders source name exactly once (no duplicate source chip)', () => {
    render(<NewsItemCard item={MOCK_ITEM} />)

    // Source name 'Example Feed' must appear exactly once — as the badge next to the date
    expect(screen.getAllByText('Example Feed')).toHaveLength(1)
    // No separate source-topic chip
    expect(screen.queryByTestId('source-topic-chip')).toBeNull()
  })

  it('renders category chips when categories are present', () => {
    const OTHER_TOPIC = makeRssFeedItemTopic({
      id: 'other-id',
      name: 'Security',
      slug: 'security',
    })
    const itemWithCategory: RssFeedItem = {
      ...MOCK_ITEM,
      categories: [
        makeRssFeedItemCategory({
          id: 'rel-2',
          category_text: 'security',
          topic: OTHER_TOPIC,
          votes_score_net: 1,
        }),
      ],
    }
    render(<NewsItemCard item={itemWithCategory} />)

    // Category chip must still render
    expect(screen.getByRole('link', { name: 'Security' })).toBeDefined()
  })

  it('summary modal links contain only rss_item — no rss_item_nav', () => {
    render(<NewsItemCard item={MOCK_ITEM} />)

    const summaryLink = screen.getByRole('link', { name: 'A short snippet' })
    const href = summaryLink.getAttribute('href')
    expect(href).toBeTruthy()
    const params = new URLSearchParams(href!.split('?')[1])
    expect(params.get('rss_item')).toBe(MOCK_ITEM.id)
    expect(params.get('rss_item_nav')).toBeNull()
  })
})
