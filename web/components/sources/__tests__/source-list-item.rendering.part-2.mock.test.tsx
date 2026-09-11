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
  it('does not render external icon link when no hostname and no home_page_url', () => {
    const feed = makeFeed({
      hostname: null,
      home_page_url: null,
    })

    const { container } = render(
      <SourceListItem
        feed={feed}
        isFollowing={false}
        isFollowingTopic={false}
      />,
    )

    const externalLink = container.querySelector(
      'a[target="_blank"][rel="nofollow noopener noreferrer"]',
    )
    expect(externalLink).toBeNull()
  })

  it('does not render DomainTrustBadge when no hostname', () => {
    const feed = makeFeed({ hostname: null })

    render(
      <SourceListItem
        feed={feed}
        isFollowing={false}
        isFollowingTopic={false}
      />,
    )

    expect(screen.queryByTestId('domain-trust-badge')).toBeNull()
  })

  it('renders DomainTrustBadge when hostname is present, with href pointing to reviews', () => {
    const feed = makeFeed({
      hostname: {
        __entity_type: 'hostname',
        id: 'h1',
        hostname: 'example.com',
        topic_id: null,
      },
    })

    render(
      <SourceListItem
        feed={feed}
        isFollowing={false}
        isFollowingTopic={false}
        hostnameElection={{
          __entity_type: 'hostname_election',
          id: 'h1',
          votes_score_net: 3,
          votes_count_up: 5,
          votes_count_down: 2,
        }}
      />,
    )

    const badge = screen.getByTestId('domain-trust-badge')
    expect(badge).not.toBeNull()
    expect(badge.getAttribute('data-href')).toBe('/source/example-topic/reviews')
  })

  it('renders "Unrated" link to reviews when no hostname', () => {
    const feed = makeFeed({ hostname: null })

    render(
      <SourceListItem
        feed={feed}
        isFollowing={false}
        isFollowingTopic={false}
      />,
    )

    const unratedLink = screen.getByRole('link', { name: 'Unrated' })
    expect(unratedLink.getAttribute('href')).toBe('/source/example-topic/reviews')
  })

  it('does not render the topic name as a badge in the metadata row', () => {
    const feed = makeFeed()

    const { container } = render(
      <SourceListItem
        feed={feed}
        isFollowing={false}
        isFollowingTopic={false}
      />,
    )

    const badge = container.querySelector('[data-slot="badge"]')
    expect(badge).toBeNull()
  })
})
