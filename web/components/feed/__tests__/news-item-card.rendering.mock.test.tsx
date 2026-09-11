import { describe, it, expect, vi } from 'vitest'
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
mockNav.setPathname('/news')
mockNav.setSearchParams('topics=travel')

const nextDynamicMock = vi.hoisted(() => {
  const React = require('react')
  return {
    default: (loader: () => Promise<unknown>) =>
      function MockDynamic(props: Record<string, unknown>) {
        const [dynamicComponent, setDynamicComponent] = React.useState(null)
        React.useEffect(() => {
          let active = true
          void loader().then((mod: unknown) => {
            if (active)
              setDynamicComponent(() =>
                typeof mod === 'function' ? mod : (mod as Record<string, unknown>).default,
              )
          })
          return () => {
            active = false
          }
        }, [])
        return dynamicComponent ? React.createElement(dynamicComponent, props) : null
      },
  }
})
vi.mock(import('next/dynamic'), () => nextDynamicMock as unknown as typeof import('next/dynamic'))

vi.mock(
  import('@/lib/auth/context'),
  () =>
    ({
      useAuth: () => ({ isAuthenticated: true }),
      useOptionalAuth: () => null,
    }) as unknown as typeof import('@/lib/auth/context'),
)

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        ...props
      }: {
        children: React.ReactNode
        href: string
        [k: string]: unknown
      }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

vi.mock(import('next/image'), () => {
  const Img = 'img' as const

  return {
    default: ({
      src,
      alt,
      width,
      height,
      className,
    }: {
      src: string
      alt: string
      width: number
      height: number
      className?: string
    }) => (
      <Img
        src={src}
        alt={alt}
        width={width}
        height={height}
        className={className}
      />
    ),
  } as unknown as typeof import('next/image')
})

vi.mock(
  import('@/components/feed/manage-categories-menu-item'),
  () =>
    ({
      ManageCategoriesMenuItem: () => null,
    }) as unknown as typeof import('@/components/feed/manage-categories-menu-item'),
)

vi.mock(import('@/components/shared/follower-share-actions'), () => ({
  FollowerShareActions: ({ className }: { className?: string }) => (
    <div
      data-testid='follower-share-actions'
      className={className}
    />
  ),
}))

vi.mock(import('@/components/shared/shared-byline'), () => ({
  SharedByline: ({ sharedByUser }: { sharedByUser?: { username?: string } }) =>
    sharedByUser?.username ? (
      <div>
        <span>Shared by</span>{' '}
        <a href={`/user/${sharedByUser.username}`}>@{sharedByUser.username}</a>
      </div>
    ) : null,
}))
const mockItem: RssFeedItem = makeRssFeedItem({
  id: 'item-1',
  published_at: '2025-01-15T10:00:00Z',
  data: {
    link: 'https://example.com/article1',
    guid: 'test-guid-1',
    title: 'Test Article Title',
    contentSnippet: 'This is a test article excerpt.',
  },
  url: { id: 'url-1', url: 'https://example.com/article1' },
  rss_feed: {
    id: 'rss-feed-1',
    title: 'Tech Weekly',
    topic: makeRssFeedItemTopic({
      id: 'topic-1',
      name: 'Technology',
      slug: 'technology',
      topic_type: 'card',
    }),
  },
})
const aiTopic = makeRssFeedItemTopic({ id: 'topic-ai', name: 'AI', slug: 'ai', topic_type: 'card' })
const mlTopic = makeRssFeedItemTopic({
  id: 'topic-ml',
  name: 'Machine Learning',
  slug: 'ml',
  topic_type: 'card',
})
describe('NewsItemCard rendering', () => {
  it('renders the article title as an external link', async () => {
    render(<NewsItemCard item={mockItem} />)
    const title = screen.getByText('Test Article Title')
    expect(title.closest('a')?.getAttribute('href')).toBe(
      'https://example.com/article1?utm_source=voucha.ai&utm_medium=referral',
    )
    expect(title.closest('a')?.getAttribute('target')).toBe('_blank')
    expect(await screen.findByTestId('follower-share-actions')).toBeDefined()
  })
  it('uses rss_feed.title (not topic.name) as source label', () => {
    render(<NewsItemCard item={mockItem} />)
    expect(screen.getByText('Tech Weekly')).toBeDefined()
  })
  it('does not render a separate "Original" link', () => {
    render(<NewsItemCard item={mockItem} />)
    expect(screen.queryByText('Original')).toBeNull()
  })
  it('passes modal href containing rss_item to footer render-prop', () => {
    const footerFn = vi.fn<VitestLooseMock>((href: string) => <a href={href}>Show more</a>)
    const item: RssFeedItem = {
      ...mockItem,
      data: {
        ...mockItem.data,
        contentSnippet: 'Short excerpt.',
      },
    }
    render(
      <NewsItemCard
        item={item}
        footer={footerFn}
      />,
    )
    expect(footerFn).toHaveBeenCalledWith(expect.stringContaining('rss_item=item-1'))
    const showMore = screen.getByText('Show more')
    expect(showMore.getAttribute('href')).toContain('rss_item=item-1')
  })
  it('renders shared attribution when present', () => {
    render(
      <NewsItemCard
        item={mockItem}
        sharedByUser={{ id: 'user-1', username: 'sharer' }}
      />,
    )
    expect(screen.getByText('Shared by')).toBeDefined()
    expect(screen.getByRole('link', { name: '@sharer' })).toHaveAttribute('href', '/user/sharer')
  })
  it('falls back to Untitled when data.title is missing', () => {
    const item: RssFeedItem = {
      ...mockItem,
      data: { ...mockItem.data, title: undefined },
    }
    render(<NewsItemCard item={item} />)
    expect(screen.getByText('Untitled')).toBeDefined()
  })
  it('strips HTML from excerpt', () => {
    const item: RssFeedItem = {
      ...mockItem,
      data: {
        ...mockItem.data,
        contentSnippet: '<p><strong>Bold</strong> text</p>',
      },
    }
    render(<NewsItemCard item={item} />)
    expect(screen.getByText('Bold text')).toBeDefined()
    expect(screen.queryByText(/<p>/)).toBeNull()
  })
  it('renders categories as topic badges', () => {
    const item: RssFeedItem = {
      ...mockItem,
      categories: [
        makeRssFeedItemCategory({
          id: 'rel-ai',
          category_text: 'ai',
          topic: aiTopic,
          votes_score_net: 1,
        }),
        makeRssFeedItemCategory({
          id: 'rel-ml',
          category_text: 'ml',
          topic: mlTopic,
          votes_score_net: 1,
        }),
      ],
    }
    render(<NewsItemCard item={item} />)
    expect(screen.getByText('AI')).toBeDefined()
    expect(screen.getByText('Machine Learning')).toBeDefined()
  })
  it('renders unmatched categories (null topic) as plain badges', () => {
    const item: RssFeedItem = {
      ...mockItem,
      categories: [
        makeRssFeedItemCategory({ category_text: 'unmatched' }),
        makeRssFeedItemCategory({
          id: 'rel-ai',
          category_text: 'ai',
          topic: aiTopic,
          votes_score_net: 1,
        }),
      ],
    }
    render(<NewsItemCard item={item} />)
    expect(screen.getByText('AI')).toBeDefined()
    expect(screen.getByText('unmatched')).toBeDefined()
  })
  it('external-link icon is an inline child of the title link (not flex-positioned)', () => {
    const { container } = render(<NewsItemCard item={mockItem} />)
    const titleLink = container.querySelector('[data-pw="news-item-card"] a[target="_blank"]')
    expect(titleLink).not.toBeNull()
    // The title link must NOT use inline-flex — that causes the icon to float to the
    // right end of the flex container instead of trailing the wrapped text.
    expect(titleLink?.className).not.toContain('inline-flex')
    // The ExternalLink SVG must be the last child inside the title link.
    const svgIcon = titleLink?.querySelector('svg')
    expect(svgIcon).not.toBeNull()
    expect(titleLink?.lastElementChild?.tagName.toLowerCase()).toBe('svg')
  })
  it('card root has relative positioning for floating kebab', () => {
    const { container } = render(<NewsItemCard item={mockItem} />)
    const card = container.querySelector('[data-pw="news-item-card"]')
    expect(card?.className).toContain('relative')
  })
  it('title column has pr-12 when authenticated so text does not overlap the floating kebab', () => {
    const { container } = render(<NewsItemCard item={mockItem} />)
    const titleCol = container.querySelector('[data-pw="news-item-card"] .space-y-1')
    expect(titleCol?.className).toContain('pr-12')
  })
  it('passes absolute-positioning className to FollowerShareActions compact kebab', async () => {
    render(<NewsItemCard item={mockItem} />)
    const actions = await screen.findByTestId('follower-share-actions')
    expect(actions.className).toContain('absolute')
    expect(actions.className).toContain('right-2')
    expect(actions.className).toContain('top-2')
  })
  it('renders source name exactly once (no duplicate source chip)', () => {
    render(<NewsItemCard item={mockItem} />)
    expect(screen.getAllByText('Tech Weekly')).toHaveLength(1)
    expect(screen.queryByTestId('source-topic-chip')).toBeNull()
  })
})
