import { mockLucideReact } from '@/test-helpers/lucide-icons'
import { describe, expect, it, vi } from 'vitest'
import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
import { makeRssFeedItem, makeRssFeedItemTopic } from '@/test-helpers/api-responses'
import { fireEvent, render, screen } from '@testing-library/react'
import { NewsItemCluster } from '../news-item-cluster'
import type { RssFeedItem, Story } from '@/types/rss-feed-items'
import type { ReactNode } from 'react'

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

const mockNav = createNavMock()
mockNav.setPathname('/news')

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
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
    Bookmark: () => null,
    BookmarkCheck: () => null,
    ChevronDown: () => <span data-testid='chevron-down' />,
    ChevronUp: () => <span data-testid='chevron-up' />,
    EyeOff: () => null,
    ExternalLink: () => null,
    Flag: () => null,
    MessageSquare: () => null,
    MessageSquarePlus: () => null,
    MoreHorizontal: () => null,
    Plus: () => null,
  }),
)

vi.mock(import('@/components/shared/follower-share-actions'), () => ({
  FollowerShareActions: () => null,
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

vi.mock(import('@/lib/rss-item-nav-context'), () => ({
  useRssItemNav: () => null,
}))

vi.mock(import('@/components/votes/score-vote'), () => ({
  ScoreVote: ({ 'data-pw': dataPw }: { 'data-pw'?: string }) => (
    <div data-testid={dataPw ?? 'score-vote'} />
  ),
}))

vi.mock(import('@/lib/api/client/elections'), () => ({
  submitRssFeedItemVote: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/components/shared/hide-button'), () => ({
  HideButton: () => (
    <button
      data-testid='hide-button'
      type='button'
      aria-label='Hide news item'
    />
  ),
}))

vi.mock(import('@/components/news/use-viewer-has-community'), () => ({
  useViewerHasCommunity: vi.fn<() => boolean>().mockReturnValue(false),
}))

const MOCK_TOPIC = makeRssFeedItemTopic({ id: 'topic-1' })

function makeItem(id: string): RssFeedItem {
  return makeRssFeedItem({
    id,
    published_at: '2026-01-01T00:00:00Z',
    data: { link: `https://example.com/${id}`, guid: `guid-${id}`, title: `Article ${id}` },
    url: { id: `url-${id}`, url: `https://example.com/${id}` },
    rss_feed: {
      id: 'feed-1',
      title: 'Example Feed',
      topic: MOCK_TOPIC,
    },
  })
}

const MOCK_STORY: Story = {
  id: 'story-1',
  title: 'Big Tech News',
  cluster_reason: null,
  published_at: '2026-01-01T00:00:00Z',
  official_rss_feed_item_id: null,
}

function getByPw(container: HTMLElement, id: string) {
  const element = container.querySelector(`[data-pw="${id}"]`)
  if (!element) throw new Error(`Missing data-pw="${id}"`)
  return element
}

describe('NewsItemCluster', () => {
  describe('standalone (no storyItems)', () => {
    it('renders the primary card', () => {
      const { container } = render(
        <NewsItemCluster
          primary={makeItem('a')}
          storyItems={[]}
          view='summary'
        />,
      )

      expect(getByPw(container, 'news-item-card')).toBeDefined()
    })

    it('renders "Discuss" button inside the card when logged in', () => {
      const { container } = render(
        <NewsItemCluster
          primary={makeItem('a')}
          storyItems={[]}
          view='summary'
        />,
      )

      const card = getByPw(container, 'news-item-card')
      const discussion = getByPw(container, 'news-discuss-button')
      expect(card.contains(discussion)).toBe(true)
    })

    it('renders the official source badge when item matches', () => {
      const primary = makeItem('a')
      const story: Story = { ...MOCK_STORY, official_rss_feed_item_id: 'a' }
      render(
        <NewsItemCluster
          primary={primary}
          storyItems={[]}
          story={story}
          view='summary'
        />,
      )

      expect(screen.getByText('Official source')).toBeDefined()
    })
  })

  describe('clustered (has storyItems)', () => {
    it('renders a cluster card without wrapping cards inside another card', () => {
      const { container } = render(
        <NewsItemCluster
          primary={makeItem('a')}
          storyItems={[makeItem('b'), makeItem('c')]}
          story={MOCK_STORY}
          view='summary'
        />,
      )

      const cluster = getByPw(container, 'news-item-cluster')
      expect(cluster.tagName.toLowerCase()).toBe('div')
      expect(container.querySelectorAll('[data-pw="news-item-card"]')).toHaveLength(3)
    })

    it('renders actions inside the cluster card', () => {
      const { container } = render(
        <NewsItemCluster
          primary={makeItem('a')}
          storyItems={[makeItem('b')]}
          story={MOCK_STORY}
          view='summary'
        />,
      )

      const cluster = getByPw(container, 'news-item-cluster')
      const [discussion] = [...container.querySelectorAll('[data-pw="news-discuss-button"]')]
      expect(discussion).toBeDefined()
      expect(cluster.contains(discussion!)).toBe(true)
    })

    it('renders the related articles toggle inside the cluster card', () => {
      const { container } = render(
        <NewsItemCluster
          primary={makeItem('a')}
          storyItems={[makeItem('b'), makeItem('c')]}
          story={MOCK_STORY}
          view='summary'
        />,
      )

      const cluster = getByPw(container, 'news-item-cluster')
      const toggle = screen.getByRole('button', { name: /related article/i })
      expect(cluster.contains(toggle)).toBe(true)
    })

    it('shows story title and event date when story has both', () => {
      render(
        <NewsItemCluster
          primary={makeItem('a')}
          storyItems={[makeItem('b')]}
          story={MOCK_STORY}
          view='summary'
        />,
      )

      expect(screen.getByText('Big Tech News')).toBeDefined()
      expect(screen.getByText(/Event:/)).toBeDefined()
    })

    it('renders each expanded story item with its own action row', () => {
      const { container } = render(
        <NewsItemCluster
          primary={makeItem('a')}
          storyItems={[makeItem('b')]}
          story={MOCK_STORY}
          view='summary'
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: /1 related article/i }))

      const cards = container.querySelectorAll('[data-pw="news-item-card"]')
      const actions = container.querySelectorAll('[data-pw="news-item-actions-row"]')
      expect(cards).toHaveLength(2)
      expect(actions).toHaveLength(2)
      expect(screen.getByRole('button', { name: /hide articles/i })).toBeDefined()
    })

    it('shows cluster reason when provided', () => {
      const story: Story = { ...MOCK_STORY, cluster_reason: 'Related by topic and timing' }
      render(
        <NewsItemCluster
          primary={makeItem('a')}
          storyItems={[makeItem('b')]}
          story={story}
          view='summary'
        />,
      )

      expect(screen.getByText('Related by topic and timing')).toBeDefined()
    })
  })
})
