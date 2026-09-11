import { describe, expect, it, vi } from 'vitest'

import { render, screen } from '@testing-library/react'

import type { ReactNode } from 'react'

import { SourceListItem } from '../source-list-item'

import type { ViewRssFeed } from '@/types/rss-feeds'

import type { User } from '@/types/user'

const mockCurrentUser: User | null = null

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ refresh: () => undefined }),
      usePathname: () => '/',
    }) as unknown as typeof import('next/navigation'),
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
        children: ReactNode
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

vi.mock(import('../rss-feed-action-slot'), () => ({
  RssFeedActionSlot: () => <span hidden />,
}))

vi.mock(import('@/lib/auth/context'), () => ({
  useAuth: () => ({
    currentUser: mockCurrentUser,
    isAuthenticated: mockCurrentUser !== null,
    logout: vi.fn<() => Promise<void>>(),
    setUser: vi.fn<(user: User | null) => void>(),
  }),
}))

vi.mock(
  import('@/components/topics/topic-vouch-disavow-vote'),
  () =>
    ({
      TopicVouchDisavowVote: (props: Record<string, unknown>) => (
        <div
          data-testid='topic-vouch-disavow-vote'
          data-election-id={props.electionId as string}
          data-signed-out={String(props.signedOut)}
        />
      ),
    }) as unknown as typeof import('@/components/topics/topic-vouch-disavow-vote'),
)

vi.mock(
  import('@/components/domains/domain-trust-badge'),
  () =>
    ({
      DomainTrustBadge: (props: Record<string, unknown>) => (
        <span
          data-testid='domain-trust-badge'
          data-href={props.href as string}
        >
          {props.hostname as string}
        </span>
      ),
    }) as unknown as typeof import('@/components/domains/domain-trust-badge'),
)

function makeFeed(overrides: Partial<ViewRssFeed> = {}): ViewRssFeed {
  return {
    __entity_type: 'rss_feed',
    id: 'feed-1',
    title: 'Test Feed',
    is_enabled: false,
    is_discoverable: false,
    etag: null,
    last_modified_at: null,
    last_fetched_at: null,
    feed_type: 'article',
    rss_feed_url: { id: 'url-1', url: 'https://example.com/feed.xml' },
    home_page_url: null,
    hostname: null,
    topic: {
      id: 'topic-1',
      name: 'Example Topic',
      slug: 'example-topic',
      topic_type: 'rss_feed',
    },
    ...overrides,
  }
}

describe('SourceListItem rendering', () => {
  it('does not render "Read or write reviews" text', () => {
    const feed = makeFeed()

    render(
      <SourceListItem
        feed={feed}
        isFollowing={false}
        isFollowingTopic={false}
      />,
    )

    expect(screen.queryByText('Read or write reviews')).toBeNull()
  })

  it('renders publisher type label when present', () => {
    const feed = makeFeed({
      publisher_type: {
        id: 'publisher-type-1',
        name: 'Mainstream Media',
        slug: 'mainstream-media',
        topic_type: 'topic',
      },
    })

    render(
      <SourceListItem
        feed={feed}
        isFollowing={false}
        isFollowingTopic={false}
      />,
    )

    const publisherTypeLink = screen.getByRole('link', { name: 'Mainstream Media' })
    expect(publisherTypeLink.getAttribute('href')).toBe('/topic/mainstream-media')
  })

  it('does not render text "Open feed" or "Open homepage"', () => {
    const feed = makeFeed({
      home_page_url: { url: 'https://example.com/' },
    })

    render(
      <SourceListItem
        feed={feed}
        isFollowing={false}
        isFollowingTopic={false}
      />,
    )

    expect(screen.queryByText('Open feed')).toBeNull()
    expect(screen.queryByText('Open homepage')).toBeNull()
  })
})
