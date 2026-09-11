import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { UserList } from '../user-list'

// RelationManagementAction uses useRouter which requires Next.js App Router context.
// Mock it so the management-list test can render without mounting the router.
vi.mock(import('../relation-management-action'), () => ({
  RelationManagementAction: ({ entityId }: { entityId: string }) => (
    <button
      type='button'
      data-testid={`relation-action-${entityId}`}
    >
      Muted
    </button>
  ),
}))

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
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
  import('@/lib/links/entity-href'),
  () =>
    ({
      userHref: (user: { id: string; username?: string }) => `/users/${user.username ?? user.id}`,
      createUserPathname: (id: string, suffix: string) => `/users/${id}${suffix}`,
    }) as unknown as typeof import('@/lib/links/entity-href'),
)

vi.mock(import('@/components/shared/user-avatar'), () => ({
  UserAvatar: ({ username }: { username: string }) => (
    <div data-testid={`user-avatar-${username}`} />
  ),
}))

vi.mock(import('@/components/shared/entity-bookmark-button'), () => ({
  EntityBookmarkButton: ({ entityId }: { entityId: string }) => (
    <button
      type='button'
      aria-label='bookmark'
      data-testid={`bookmark-${entityId}`}
    />
  ),
}))

vi.mock(import('@/components/shared/agent-badge'), () => ({
  AgentBadge: () => <span data-testid='agent-badge' />,
}))

describe('UserList — management list', () => {
  it('does not show row mute button when relationAction is set', async () => {
    render(
      <UserList
        users={[{ id: 'user-other', username: 'bob' }]}
        emptyTitle='No users'
        emptyDescription='Nothing to show.'
        currentUserId='user-viewer'
        relationAction={{
          entityType: 'user',
          predicate: 'mute',
          activeLabel: 'extracted.userProfileCollections.usersRssFeeds.muted_2346f214',
          inactiveLabel: 'extracted.userProfileCollections.usersRssFeeds.mute_8dd6857b',
          errorLabel: 'extracted.userProfileCollections.usersRssFeeds.mutedUser_a41ce167',
        }}
      />,
    )
    // row-level mute button must not appear alongside the management action
    expect(document.querySelector('[data-pw="user-list-mute-button"]')).toBeNull()
  })

  it('renders a card per user in searchMode', async () => {
    render(
      <UserList
        users={[{ id: 'user-alice', username: 'alice' }]}
        emptyTitle='No users'
        emptyDescription='Nothing to show.'
        searchMode
      />,
    )
    // searchMode renders a Card with a data-pw keyed by user id
    expect(document.querySelector('[data-pw="user-card-user-alice"]')).not.toBeNull()
    // The non-searchMode item element must not appear
    expect(document.querySelector('[data-pw="user-list-item"]')).toBeNull()
    // The user's username handle should appear
    expect(screen.getByText('@alice')).toBeDefined()
  })
})
