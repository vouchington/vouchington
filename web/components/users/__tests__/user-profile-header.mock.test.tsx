import {
  baseUser,
  mockProfileAuth,
  resetUserProfileHeaderDoubles,
} from '@/test-helpers/components/users/user-profile-header.mock-support'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen } from '@testing-library/react'

import { UserProfileHeader } from '../user-profile-header'

import type { User } from '@/types/user'

vi.mock(import('@/components/shared/follow-button'), () => ({
  FollowButton: ({ onChange }: { onChange?: (isActive: boolean) => void }) => (
    <div data-testid='follow-button'>
      <button
        type='button'
        onClick={() => onChange?.(true)}
      >
        Complete follow
      </button>
      <button
        type='button'
        onClick={() => onChange?.(false)}
      >
        Complete unfollow
      </button>
    </div>
  ),
}))

describe('UserProfileHeader', () => {
  beforeEach(() => {
    resetUserProfileHeaderDoubles()
  })
  it('renders display name and username', () => {
    const { container } = render(<UserProfileHeader user={baseUser} />)
    expect(screen.getByRole('heading', { level: 1 })).toBeDefined()
    expect(screen.getByText('Alice Example')).toBeDefined()
    expect(screen.getByText('@alice')).toBeDefined()
    expect(container.querySelector('[data-pw="user-profile-header"]')).not.toBeNull()
  })

  it('renders metrics when provided', () => {
    render(
      <UserProfileHeader
        user={baseUser}
        metrics={{
          count: {
            reviews: 3,
            discussions: 5,
            comments: 10,
            users_following: 0,
            users_followers: 0,
            topics_following: 0,
            rss_feeds_following: 0,
            communities_member: 0,
          },
        }}
      />,
    )
    expect(screen.getByText(/3 reviews/)).toBeDefined()
    expect(screen.getByText(/5 discussions/)).toBeDefined()
  })

  it('signed-out (no currentUserId): FollowButton renders, no subscribe bookmark button', async () => {
    render(<UserProfileHeader user={baseUser} />)
    // canFollow = undefined !== 'user-abc' = true → FollowButton slot renders
    // canManageBookmarks = !!undefined && ... = false -> subscribe slot skipped
    await screen.findByTestId('follow-button')
    expect(screen.queryByTestId('subscribe-button')).toBeNull()
  })

  it('viewing own profile (currentUserId === user.id): no FollowButton, no subscribe bookmark button', () => {
    mockProfileAuth.currentUser = { id: 'user-abc' } as User
    render(<UserProfileHeader user={baseUser} />)
    // canFollow = 'user-abc' !== 'user-abc' = false → slot skipped entirely
    // canManageBookmarks = false → slot skipped entirely
    expect(screen.queryByTestId('follow-button')).toBeNull()
    expect(screen.queryByTestId('subscribe-button')).toBeNull()
  })

  it('signed-in viewing another profile: FollowButton renders; subscribe button is not in hero (moved to aside)', async () => {
    mockProfileAuth.currentUser = { id: 'user-xyz' } as User
    render(<UserProfileHeader user={baseUser} />)
    // canFollow = 'user-xyz' !== 'user-abc' = true → FollowButton slot renders
    // Subscribe to Posts was moved to UserActionsAside — not rendered in this component
    expect(await screen.findByTestId('follow-button')).toBeDefined()
    expect(screen.queryByTestId('subscribe-button')).toBeNull()
  })

  it('links the @username handle to the user page (not landing page)', () => {
    render(<UserProfileHeader user={baseUser} />)
    const handleLink = screen.getByRole('link', { name: '@alice' })
    expect(handleLink.getAttribute('href')).toBe('/user/alice')
  })

  it('renders an admin management link for administrators', () => {
    render(
      <UserProfileHeader
        user={baseUser}
        isAdmin
      />,
    )

    expect(screen.getByRole('link', { name: 'Admin' }).getAttribute('href')).toBe(
      '/user/alice/admin',
    )
  })

  it.each([
    ['official', 'Official'],
    ['system', 'System'],
    ['ai_agent', 'AI Agent'],
  ] as const)('shows the public %s author label', (account_type, label) => {
    render(<UserProfileHeader user={{ ...baseUser, account_type }} />)
    expect(screen.getByText(label)).toBeDefined()
  })

  it('renders profile links when profileLinks is non-empty', () => {
    render(
      <UserProfileHeader
        user={baseUser}
        profileLinks={[
          {
            id: 'l1',
            link_type: 'twitter',
            handle: 'alice',
            url: null,
            name: null,
          },
        ]}
      />,
    )
    expect(screen.getByTestId('user-profile-links')).toBeDefined()
  })

  it('does not render profile links when profileLinks is empty', () => {
    render(
      <UserProfileHeader
        user={baseUser}
        profileLinks={[]}
      />,
    )
    expect(screen.queryByTestId('user-profile-links')).toBeNull()
  })
})
