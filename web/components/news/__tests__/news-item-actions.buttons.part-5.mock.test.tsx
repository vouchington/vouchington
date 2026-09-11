import { mockLucideReact } from '@/test-helpers/lucide-icons'
import { describe, expect, it, vi } from 'vitest'

import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
import { makeRssFeedItem, makeRssFeedItemTopic } from '@/test-helpers/api-responses'

import { act, render, screen } from '@testing-library/react'

import type { ReactNode } from 'react'

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

const leadingAction = <span data-testid='leading'>Show more</span>

const trailingAction = <span data-testid='trailing'>Next</span>

interface ToggleMockProps {
  active?: boolean
  initialActive?: boolean
  onActiveChange?: (active: boolean) => void
  pending?: boolean
  onPendingChange?: (pending: boolean) => void
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

vi.mock(import('@/components/news/news-community-discussion-action'), () => ({
  NewsCommunityDiscussionAction: () => <div data-testid='community-discussion-action' />,
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
  SaveButton: ({
    active,
    initialActive,
    onActiveChange,
    pending,
    onPendingChange,
  }: ToggleMockProps) => (
    <button
      data-testid='save-button'
      data-active={active ?? initialActive}
      type='button'
      disabled={pending}
      onClick={() => {
        onPendingChange?.(true)
        onActiveChange?.(!(active ?? initialActive))
      }}
    >
      {(active ?? initialActive) ? 'Saved' : 'Save'}
    </button>
  ),
  SaveMenuItem: ({
    active,
    initialActive,
    onActiveChange,
    pending,
    onPendingChange,
  }: ToggleMockProps) => (
    <button
      type='button'
      aria-label='Toggle save menu item'
      data-testid='save-menu-item'
      data-active={active ?? initialActive}
      disabled={pending}
      onClick={() => {
        onPendingChange?.(true)
        onActiveChange?.(!(active ?? initialActive))
      }}
    />
  ),
}))

vi.mock(import('@/components/shared/report-menu-item'), () => ({
  ReportMenuItem: ({ entityType, entityId }: { entityType: string; entityId: string }) => (
    <button
      type='button'
      aria-label='Report'
      data-testid='report-menu-item'
      data-entity-type={entityType}
      data-entity-id={entityId}
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

vi.mock(import('lucide-react'), () =>
  mockLucideReact({
    Loader2: () => null,
    ExternalLink: () => null,
    Flag: () => null,
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

describe('NewsItemActions hide/save buttons and leading/trailing actions', () => {
  it('does not render an inline report button in the row variant', () => {
    const { container } = render(
      <NewsItemActions
        item={MOCK_ITEM}
        relatedPosts={[]}
      />,
    )

    expect(container.querySelector('[data-pw="report-inline-button"]')).toBeNull()
  })

  it('resets pending save/hide state when entity changes during modal navigation', () => {
    const itemA = { ...MOCK_ITEM, id: 'item-a' }
    const itemB = { ...MOCK_ITEM, id: 'item-b' }

    const { rerender } = render(
      <NewsItemActions
        item={itemA}
        relatedPosts={[]}
        variant='modal-footer'
        viewerBookmarks={{ hide: false, save: false }}
      />,
    )

    // Simulate clicking Save to set pending=true (mock calls onPendingChange(true))
    act(() => {
      screen.getByTestId('save-button').click()
    })

    expect(screen.getByTestId('save-button')).toBeDisabled()

    // Navigate to a different entity — pending state must be cleared
    act(() => {
      rerender(
        <NewsItemActions
          item={itemB}
          relatedPosts={[]}
          variant='modal-footer'
          viewerBookmarks={{ hide: false, save: false }}
        />,
      )
    })

    expect(screen.getByTestId('save-button')).not.toBeDisabled()
  })
})
