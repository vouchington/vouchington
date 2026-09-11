import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { SourceListItem } from '../source-list-item'
import type { ViewRssFeed } from '@/types/rss-feeds'
import type { User } from '@/types/user'

let mockCurrentUser: User | null = null

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

vi.mock(import('@/components/shared/follow-button'), () => ({
  FollowButton: ({
    'data-pw': dataPw,
    inactiveLabel,
  }: {
    'data-pw'?: string
    inactiveLabel?: string
  }) => (
    <button
      type='button'
      data-testid={dataPw ?? 'follow-button'}
      aria-label={inactiveLabel ?? 'Follow'}
    />
  ),
}))

vi.mock(
  import('@/lib/auth/context'),
  () =>
    ({
      useAuth: () => ({
        currentUser: mockCurrentUser,
        isAuthenticated: mockCurrentUser !== null,
        logout: vi.fn<() => Promise<void>>(),
        setUser: vi.fn<(user: typeof mockCurrentUser) => void>(),
      }),
    }) as unknown as typeof import('@/lib/auth/context'),
)

vi.mock(import('@/components/shared/entity-bookmark-button'), () => ({
  EntityBookmarkButton: ({
    initialActive,
    'data-pw': dataPw,
  }: {
    initialActive?: boolean
    'data-pw'?: string
  }) => (
    <button
      type='button'
      data-testid={dataPw ?? 'entity-bookmark-button'}
      data-active={String(initialActive)}
      aria-label='Bookmark source'
    />
  ),
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

const mockUser: User = {
  id: 'u1',
  roles: [],
}

describe('SourceListItem voting and subscribe interactions', () => {
  it('renders TopicVouchDisavowVote when topicElection is present', () => {
    mockCurrentUser = mockUser
    const feed = makeFeed()

    render(
      <SourceListItem
        feed={feed}
        isFollowing={false}
        isFollowingTopic={false}
        topicElection={{
          id: 'elec-1',
          votes_score_net: 0,
          votes_count_up: 5,
          votes_count_down: 3,
        }}
      />,
    )

    const voteEl = screen.getByTestId('topic-vouch-disavow-vote')
    expect(voteEl).not.toBeNull()
    expect(voteEl.getAttribute('data-signed-out')).toBe('false')
  })

  it('renders TopicVouchDisavowVote as disabled when currentUser is null', () => {
    mockCurrentUser = null
    const feed = makeFeed()

    render(
      <SourceListItem
        feed={feed}
        isFollowing={false}
        isFollowingTopic={false}
        topicElection={{
          id: 'elec-1',
          votes_score_net: 0,
          votes_count_up: 5,
          votes_count_down: 3,
        }}
      />,
    )

    const voteEl = screen.getByTestId('topic-vouch-disavow-vote')
    expect(voteEl.getAttribute('data-signed-out')).toBe('true')
  })

  it('does not render TopicVouchDisavowVote when topicElection is missing', () => {
    const feed = makeFeed()

    render(
      <SourceListItem
        feed={feed}
        isFollowing={false}
        isFollowingTopic={false}
      />,
    )

    expect(screen.queryByTestId('topic-vouch-disavow-vote')).toBeNull()
  })

  it('renders Follow Source and Follow Topic buttons', async () => {
    mockCurrentUser = mockUser
    const feed = makeFeed()

    const { findByTestId } = render(
      <SourceListItem
        feed={feed}
        isFollowing={false}
        isFollowingTopic={false}
      />,
    )

    // Both follow buttons render (async via nextDynamic) with their data-pw test-ids
    expect(await findByTestId('source-list-follow-source-button')).toBeTruthy()
    expect(await findByTestId('source-list-follow-topic-button')).toBeTruthy()
  })

  it('passes isFollowingTopic=true to the Follow Topic button', async () => {
    mockCurrentUser = mockUser
    const feed = makeFeed()

    const { findByTestId } = render(
      <SourceListItem
        feed={feed}
        isFollowing={false}
        isFollowingTopic
      />,
    )

    // Real FollowButton passes isFollowingTopic → initialActive to EntityBookmarkButton mock
    const topicBtn = await findByTestId('source-list-follow-topic-button')
    expect(topicBtn.getAttribute('data-active')).toBe('true')
  })

  it('does not render Subscribe to News button', () => {
    mockCurrentUser = null
    const feed = makeFeed()

    render(
      <SourceListItem
        feed={feed}
        isFollowing={false}
        isFollowingTopic={false}
      />,
    )

    expect(document.querySelector('[data-testid="source-subscribe-news"]')).toBeNull()
  })
})
