import { mockLucideReact } from '@/test-helpers/lucide-icons'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createNavMock, navMockModule } from '@/test-helpers/next-navigation-mock'
import { makeRssFeedItem, makeRssFeedItemTopic } from '@/test-helpers/api-responses'
import type { RssFeedItem, Story } from '@/types/rss-feed-items'
import type { NewsCommunityDiscussionUrl } from '../community-discussion-types'
import { NewsItemCluster } from '../news-item-cluster'

interface CapturedActionsProps {
  item: RssFeedItem
  communityDiscussionUrls?: NewsCommunityDiscussionUrl[]
}

interface CapturedCommunityActionProps {
  fixedCommunity?: { slug: string }
}

const { capturedActions, capturedCommunityActions } = vi.hoisted(() => ({
  capturedActions: [] as CapturedActionsProps[],
  capturedCommunityActions: [] as CapturedCommunityActionProps[],
}))

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

const mockNav = createNavMock()
mockNav.setPathname('/news')

vi.mock(
  import('next/dynamic'),
  () =>
    ({
      default: () =>
        function MockDynamic({ menuLeadingItems }: { menuLeadingItems?: React.ReactNode }) {
          return <div>{menuLeadingItems}</div>
        },
    }) as unknown as typeof import('next/dynamic'),
)

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        href,
        children,
        prefetch: _prefetch,
        ...props
      }: {
        href: string
        children: React.ReactNode
        prefetch?: boolean
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

vi.mock(import('lucide-react'), () =>
  mockLucideReact({
    Loader2: () => null,
    Bookmark: () => null,
    BookmarkCheck: () => null,
    ChevronDown: () => null,
    ChevronUp: () => null,
    EyeOff: () => null,
    ExternalLink: () => null,
    Flag: () => null,
    MessageSquare: () => null,
    MoreHorizontal: () => null,
    Plus: () => null,
  }),
)

vi.mock(import('@/components/shared/follower-share-actions'), () => ({
  FollowerShareActions: () => null,
}))

vi.mock(import('@/components/shared/shared-byline'), () => ({
  SharedByline: () => null,
}))

vi.mock(
  import('@/lib/auth/context'),
  () =>
    ({
      useAuth: () => ({ isAuthenticated: true }),
      useOptionalAuth: () => null,
    }) as unknown as typeof import('@/lib/auth/context'),
)

vi.mock(import('@/lib/rss-item-nav-context'), () => ({
  useRssItemNav: () => null,
}))

vi.mock(import('@/components/votes/score-vote'), () => ({
  ScoreVote: () => null,
}))

vi.mock(
  import('@/components/shared/hide-button'),
  () =>
    ({
      HideButton: () => null,
    }) as unknown as typeof import('@/components/shared/hide-button'),
)

vi.mock(import('@/lib/api/client/elections'), () => ({
  submitRssFeedItemVote: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('../news-item-actions'), () => ({
  NewsItemActions: (props: CapturedActionsProps) => {
    capturedActions.push(props)
    return <div data-testid={`actions-${props.item.id}`} />
  },
}))

vi.mock(import('@/components/news/news-community-discussion-action'), () => ({
  NewsCommunityDiscussionAction: (props: CapturedCommunityActionProps) => {
    capturedCommunityActions.push(props)
    return <div data-testid='community-discussion-menu-action' />
  },
}))

vi.mock(
  import('@/components/feed/manage-categories-menu-item'),
  () =>
    ({
      ManageCategoriesMenuItem: () => null,
    }) as unknown as typeof import('@/components/feed/manage-categories-menu-item'),
)

function makeItem(id: string): RssFeedItem {
  return makeRssFeedItem({
    id,
    published_at: '2026-01-01T00:00:00Z',
    data: { link: `https://example.com/${id}`, guid: `guid-${id}`, title: `Article ${id}` },
    url: { id: `url-${id}`, url: `https://example.com/${id}` },
    rss_feed: {
      id: 'feed-1',
      title: 'Example Feed',
      topic: makeRssFeedItemTopic({ id: 'topic-1' }),
    },
  })
}

const story: Story = {
  id: 'story-1',
  title: 'Story',
  cluster_reason: null,
  published_at: '2026-01-01T00:00:00Z',
  official_rss_feed_item_id: null,
}

describe('NewsItemCluster community discussion actions', () => {
  it('passes all visible story URLs to expanded story item actions', () => {
    capturedActions.length = 0
    capturedCommunityActions.length = 0

    render(
      <NewsItemCluster
        primary={makeItem('primary')}
        storyItems={[makeItem('related')]}
        story={story}
        view='summary'
        expanded
        communityDiscussionTarget={{
          id: 'community-1',
          name: 'Rewards',
          slug: 'rewards',
          visibility: 'public',
        }}
      />,
    )

    const relatedActions = capturedActions.find(props => props.item.id === 'related')
    expect(relatedActions?.communityDiscussionUrls).toEqual([
      { id: 'url-primary', url: 'https://example.com/primary' },
      { id: 'url-related', url: 'https://example.com/related' },
    ])
  })
})
