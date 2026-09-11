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
  it('renders title as a link to the topic /latest page', () => {
    const feed = makeFeed()

    const { container } = render(
      <SourceListItem
        feed={feed}
        isFollowing={false}
        isFollowingTopic={false}
      />,
    )

    expect(container.querySelector('[data-pw="source-list-item"]')).not.toBeNull()
    const titleLink = screen.getByRole('link', { name: 'Test Feed (News Source)' })
    expect(titleLink.getAttribute('href')).toBe('/source/example-topic/latest')
  })

  it('falls back to the topic name when the feed title is empty', () => {
    const feed = makeFeed({ title: '' })

    render(
      <SourceListItem
        feed={feed}
        isFollowing={false}
        isFollowingTopic={false}
      />,
    )

    expect(
      screen.getByRole('link', { name: 'Example Topic (News Source)' }).getAttribute('href'),
    ).toBe('/source/example-topic/latest')
  })

  it('renders inline hostname link when hostname present', () => {
    const feed = makeFeed({
      hostname: {
        __entity_type: 'hostname',
        id: 'h1',
        hostname: 'example.com',
        topic_id: null,
      },
      home_page_url: { url: 'https://example.com/' },
    })

    render(
      <SourceListItem
        feed={feed}
        isFollowing={false}
        isFollowingTopic={false}
      />,
    )

    const domainLink = screen.getByRole('link', { name: 'example.com' })
    expect(domainLink.getAttribute('href')).toBe('/domain/example.com')
  })

  it('renders external icon link when home_page_url is present', () => {
    const feed = makeFeed({
      hostname: {
        __entity_type: 'hostname',
        id: 'h1',
        hostname: 'example.com',
        topic_id: null,
      },
      home_page_url: { url: 'https://example.com/' },
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
    expect(externalLink).not.toBeNull()
    expect(externalLink!.getAttribute('href')).toBe('https://example.com/')
  })

  it('falls back to hostname URL when home_page_url is null', () => {
    const feed = makeFeed({
      hostname: {
        __entity_type: 'hostname',
        id: 'h1',
        hostname: 'example.com',
        topic_id: null,
      },
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
    expect(externalLink).not.toBeNull()
    expect(externalLink!.getAttribute('href')).toBe('https://example.com/')
  })
})
