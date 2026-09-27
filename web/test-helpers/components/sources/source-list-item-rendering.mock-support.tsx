/* oxlint-disable no-mistakes/playwright-consistent-attribute -- moved test support preserves existing Testing Library selectors */
import type { ReactNode } from 'react'
import { vi } from 'vitest'
import { navMockModule } from '@/test-helpers/next-navigation-mock'
import type { ViewRssFeed } from '@/types/rss-feeds'
import type { User } from '@/types/user'

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
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

vi.mock(
  import('../../../components/sources/rss-feed-action-slot'),
  () =>
    ({
      RssFeedActionSlot: () => <span hidden />,
    }) as unknown as typeof import('../../../components/sources/rss-feed-action-slot'),
)

vi.mock(
  import('@/lib/auth/context'),
  () =>
    ({
      useAuth: () => ({
        currentUser: null,
        isAuthenticated: false,
        logout: vi.fn<() => Promise<void>>(),
        setUser: vi.fn<(user: User | null) => void>(),
      }),
    }) as unknown as typeof import('@/lib/auth/context'),
)

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

export function makeFeed(overrides: Partial<ViewRssFeed> = {}): ViewRssFeed {
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
