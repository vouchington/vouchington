/* oxlint-disable no-mistakes/playwright-consistent-attribute, no-mistakes/playwright-literals -- moved test support preserves existing Testing Library selectors */
import type { ReactNode } from 'react'
import { vi } from 'vitest'
import { makeRssFeedItem, makeRssFeedItemTopic } from '@/test-helpers/api-responses'
import { mockLucideReact } from '@/test-helpers/lucide-icons'
import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
import type { RssFeedItem } from '@/types/rss-feed-items'
// Imported after the mock helpers above so the lucide mock factory can reference them.
import { Button } from '@/components/ui/button'

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
  HideButton: ({ active, initialActive, onActiveChange }: ToggleMockProps) => (
    <Button
      data-testid='hide-button'
      data-active={active ?? initialActive}
      type='button'
      onClick={() => onActiveChange?.(!(active ?? initialActive))}
    >
      {(active ?? initialActive) ? 'Unhide' : 'Hide'}
    </Button>
  ),
  HideMenuItem: ({ active, initialActive, onActiveChange }: ToggleMockProps) => (
    <Button
      type='button'
      aria-label='Toggle hide menu item'
      data-testid='hide-menu-item'
      data-active={active ?? initialActive}
      onClick={() => onActiveChange?.(!(active ?? initialActive))}
    />
  ),
}))

vi.mock(import('@/components/shared/save-button'), () => ({
  SaveButton: ({ active, initialActive, onActiveChange }: ToggleMockProps) => (
    <Button
      data-testid='save-button'
      data-active={active ?? initialActive}
      type='button'
      onClick={() => onActiveChange?.(!(active ?? initialActive))}
    >
      {(active ?? initialActive) ? 'Saved' : 'Save'}
    </Button>
  ),
  SaveMenuItem: ({ active, initialActive, onActiveChange }: ToggleMockProps) => (
    <Button
      type='button'
      aria-label='Toggle save menu item'
      data-testid='save-menu-item'
      data-active={active ?? initialActive}
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
      <Button
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

export { mockAuthState }

export const MOCK_ITEM: RssFeedItem = makeRssFeedItem({
  id: 'item-1',
  data: { link: 'https://example.com', guid: 'g1', title: 'Article' },
  url: { id: 'url-1', url: 'https://example.com' },
  rss_feed: {
    id: 'feed-1',
    title: 'Tech Feed',
    topic: makeRssFeedItemTopic({ id: 'topic-1' }),
  },
})
