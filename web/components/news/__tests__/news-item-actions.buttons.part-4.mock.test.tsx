import { mockLucideReact } from '@/test-helpers/lucide-icons'
import { describe, expect, it, vi } from 'vitest'

import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
import { makeRssFeedItem, makeRssFeedItemTopic } from '@/test-helpers/api-responses'

import { render, screen } from '@testing-library/react'

import type { ReactNode } from 'react'

import type { Post } from '@/types/posts'
import type { RssFeedItem } from '@/types/rss-feed-items'

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

const mockAuthState = vi.hoisted(() => ({ isAuthenticated: true }))
vi.mock(
  import('@/lib/auth/context'),
  () =>
    ({
      useAuth: () => ({ isAuthenticated: mockAuthState.isAuthenticated }),
    }) as unknown as typeof import('@/lib/auth/context'),
)

const mockNav = createNavMock()

mockNav.setPathname('/news')

interface ToggleMockProps {
  active?: boolean
  initialActive?: boolean
  onActiveChange?: (active: boolean) => void
  pending?: boolean
}

interface FollowerShareActionsMockProps {
  dataPw?: string
  menuLeadingItems?: ReactNode
  className?: string
  compact?: boolean
  entityType?: string
  entityId?: string
}

vi.mock(import('@/components/votes/score-vote'), () => ({
  ScoreVote: ({ 'data-pw': dataPw }: { display?: string; 'data-pw'?: string }) => (
    <div data-testid={dataPw ?? 'score-vote'} />
  ),
}))

vi.mock(import('@/components/news/news-discuss-menu'), () => ({
  NewsDiscussMenu: () => <div data-testid='news-discuss-menu' />,
}))

vi.mock(import('@/components/shared/hide-button'), () => ({
  HideButton: ({ active, initialActive, onActiveChange, pending }: ToggleMockProps) => (
    <button
      data-testid='hide-button'
      data-active={active ?? initialActive}
      type='button'
      disabled={pending}
      onClick={() => onActiveChange?.(!(active ?? initialActive))}
    >
      {(active ?? initialActive) ? 'Unhide' : 'Hide'}
    </button>
  ),
  HideMenuItem: ({ active, initialActive, onActiveChange, pending }: ToggleMockProps) => (
    <button
      type='button'
      aria-label='Toggle hide menu item'
      data-testid='hide-menu-item'
      data-active={active ?? initialActive}
      disabled={pending}
      onClick={() => onActiveChange?.(!(active ?? initialActive))}
    />
  ),
}))

vi.mock(import('@/components/shared/save-button'), () => ({
  SaveButton: ({ active, initialActive, onActiveChange, pending }: ToggleMockProps) => (
    <button
      data-testid='save-button'
      data-active={active ?? initialActive}
      type='button'
      disabled={pending}
      onClick={() => onActiveChange?.(!(active ?? initialActive))}
    >
      {(active ?? initialActive) ? 'Saved' : 'Save'}
    </button>
  ),
  SaveMenuItem: ({ active, initialActive, onActiveChange, pending }: ToggleMockProps) => (
    <button
      type='button'
      aria-label='Toggle save menu item'
      data-testid='save-menu-item'
      data-active={active ?? initialActive}
      disabled={pending}
      onClick={() => onActiveChange?.(!(active ?? initialActive))}
    />
  ),
}))

vi.mock(import('@/lib/api/client/elections'), () => ({
  submitRssFeedItemVote: vi.fn<VitestLooseMock>(),
}))

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

vi.mock(import('lucide-react'), () =>
  mockLucideReact({
    Loader2: () => null,
    ExternalLink: () => null,
    MessageSquare: () => null,
    MoreHorizontal: () => null,
    Plus: () => null,
  }),
)

vi.mock(import('@/components/shared/follower-share-actions'), () => ({
  FollowerShareActions: ({
    dataPw,
    menuLeadingItems,
    className,
  }: FollowerShareActionsMockProps) => (
    <div className={className}>
      <button
        type='button'
        aria-label='More actions'
        data-pw={dataPw ?? 'follower-share-more-actions-button'}
      />
      {menuLeadingItems}
    </div>
  ),
}))

vi.mock(import('@/components/shared/shared-byline'), () => ({
  SharedByline: () => null,
}))

vi.mock(import('@/lib/rss-item-nav-context'), () => ({
  useRssItemNav: () => null,
}))

vi.mock(
  import('@/components/feed/manage-categories-menu-item'),
  () =>
    ({
      ManageCategoriesMenuItem: () => null,
    }) as unknown as typeof import('@/components/feed/manage-categories-menu-item'),
)

vi.mock(
  import('@/components/lists/add-to-list-menu-item'),
  () =>
    ({
      AddToListMenuItem: () => null,
    }) as unknown as typeof import('@/components/lists/add-to-list-menu-item'),
)

import { NewsItemActions } from '../news-item-actions'

const MOCK_ITEM: RssFeedItem = makeRssFeedItem({
  id: 'item-1',
  data: { link: 'https://example.com', guid: 'g1', title: 'Article' },
  url: { id: 'url-1', url: 'https://example.com' },
  rss_feed: {
    id: 'feed-1',
    title: 'Tech Feed',
    topic: makeRssFeedItemTopic({ id: 'topic-1' }),
  },
})

const RELATED_POST: Post = {
  id: 'post-1',
  post_type: 'discussion',
  title: 'Existing discussion',
  slug: 'existing-discussion',
  markdown: '',
  root_id: null,
  created_by_id: 'user-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  deleted_at: null,
  deleted_by_id: null,
  archived_at: null,
  archived_by_id: null,
  broadcast: 'everyone',
  privacy: 'public',
  is_anonymous: false,
  community_id: null,
  clearance_status: 'approved',
}

describe('NewsItemActions hide/save buttons and leading/trailing actions', () => {
  it('renders modal footer actions as mobile More menu plus desktop inline actions', () => {
    const { container } = render(
      <NewsItemActions
        item={MOCK_ITEM}
        election={{
          __entity_type: 'rss_feed_item_election',
          id: 'election-1',
          votes_score_net: 0,
          votes_count_up: 1,
          votes_count_down: 0,
        }}
        relatedPosts={[]}
        viewerBookmarks={{ hide: true, save: true }}
        variant='modal-footer'
      />,
    )

    const modalVote = screen.getByTestId('news-item-modal-vote')
    expect(modalVote).toBeDefined()

    const moreButton = container.querySelector(
      '[data-pw="rss-feed-item-modal-more-actions-button"]',
    )
    expect(moreButton).not.toBeNull()
    const moreWrapper = moreButton?.closest('div')
    expect(moreWrapper?.className).toContain('sm:hidden')

    expect(screen.getByTestId('hide-menu-item').getAttribute('data-active')).toBe('true')
    expect(screen.getByTestId('save-menu-item').getAttribute('data-active')).toBe('true')
    expect(screen.getByTestId('news-discuss-menu')).toBeDefined()

    const desktopActions = container.querySelector(String.raw`.sm\:flex`)
    expect(desktopActions?.className).toContain('hidden')
    expect(screen.getByTestId('hide-button').getAttribute('data-active')).toBe('true')
    expect(screen.getByTestId('save-button').getAttribute('data-active')).toBe('true')
    expect(container.querySelector('[data-pw="follower-share-more-actions-button"]')).not.toBeNull()
    expect(container.querySelector('[data-pw="report-inline-button"]')).toBeNull()
  })

  it('does not render an empty modal footer desktop actions wrapper', () => {
    mockAuthState.isAuthenticated = false
    const { container } = render(
      <NewsItemActions
        item={MOCK_ITEM}
        relatedPosts={[]}
        variant='modal-footer'
      />,
    )

    expect(container.querySelector(String.raw`.sm\:flex`)).toBeNull()
    expect(
      container.querySelector('[data-pw="rss-feed-item-modal-more-actions-button"]'),
    ).toBeNull()
    mockAuthState.isAuthenticated = true
  })
  it('renders community discussions menu when community target is provided', () => {
    render(
      <NewsItemActions
        item={MOCK_ITEM}
        relatedPosts={[RELATED_POST]}
        variant='modal-footer'
        communityDiscussionTarget={{
          id: 'community-1',
          name: 'Rewards',
          slug: 'rewards',
          visibility: 'public',
        }}
        communityDiscussionUrls={[{ id: 'url-1', url: 'https://example.com' }]}
      />,
    )
    expect(screen.getByTestId('news-discuss-menu')).toBeDefined()
  })
})
