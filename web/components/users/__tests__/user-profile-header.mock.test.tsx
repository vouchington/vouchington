import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
import React, { type ReactNode } from 'react'

import { beforeEach, describe, it, expect, vi } from 'vitest'

import { render, screen } from '@testing-library/react'

import { UserProfileHeader } from '../user-profile-header'

import type { User } from '@/types/user'

const mockNav = createNavMock()

let mockCurrentUser: User | null = null

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

// Make next/dynamic pass through to the mocked component modules by using
// React.lazy so the test stubs below are actually rendered.
vi.mock(
  import('next/dynamic'),
  () =>
    ({
      default: (loader: () => Promise<unknown>) => {
        const LazyComp = React.lazy(
          async (): Promise<{
            default: React.ComponentType<Record<string, unknown>>
          }> => {
            const mod = await loader()
            if (typeof mod === 'function') {
              return { default: mod as React.ComponentType<Record<string, unknown>> }
            }
            const obj = mod as Record<string, unknown>
            const comp =
              (obj.default as React.ComponentType<Record<string, unknown>> | undefined) ??
              (Object.values(obj).find(v => typeof v === 'function') as
                | React.ComponentType<Record<string, unknown>>
                | undefined) ??
              (() => null)
            return { default: comp }
          },
        )
        function DynWrapper(props: Record<string, unknown>) {
          return (
            <React.Suspense fallback={null}>
              <LazyComp {...props} />
            </React.Suspense>
          )
        }
        return DynWrapper
      },
    }) as unknown as typeof import('next/dynamic'),
)

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
  EntityBookmarkButton: () => <div data-testid='subscribe-button' />,
}))

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

vi.mock(import('@/components/shared/user-avatar'), () => ({
  UserAvatar: () => <div data-testid='user-avatar' />,
}))

vi.mock(import('@/components/shared/rss-feed-link'), () => ({
  RssFeedLink: () => <div data-testid='rss-feed-link' />,
}))

vi.mock(import('@/components/shared/agent-badge'), () => ({
  AgentBadge: () => <div data-testid='agent-badge' />,
}))

vi.mock(import('../identity-verified-badge'), () => ({
  IdentityVerifiedBadge: () => <div data-testid='identity-verified-badge' />,
}))

vi.mock(import('../profile-links'), () => ({
  UserProfileLinks: ({ links }: { links: { id: string; link_type: string }[] }) => (
    <div
      data-testid='user-profile-links'
      data-count={links.length}
    />
  ),
}))

vi.mock(
  import('@/components/shared/markdown-content'),
  () =>
    ({
      MARKDOWN_CONTENT_FEATURES_UTM: { utm: true },
      MarkdownContent: ({
        html,
        className,
        features,
      }: {
        html: string
        className?: string
        features?: Record<string, boolean>
      }) => (
        <div
          data-testid='markdown-content'
          data-html={html}
          data-classname={className ?? ''}
          data-features={features !== undefined ? JSON.stringify(features) : ''}
        />
      ),
    }) as unknown as typeof import('@/components/shared/markdown-content'),
)

const baseUser: User = {
  id: 'user-abc',
  username: 'alice',
  display_account: { id: 'display-1', name: 'Alice Example' },
  profile_image_id: null,
  roles: [],
}

describe('UserProfileHeader', () => {
  beforeEach(() => {
    mockNav.reset()
    mockCurrentUser = null
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
    mockCurrentUser = { id: 'user-abc' } as User
    render(<UserProfileHeader user={baseUser} />)
    // canFollow = 'user-abc' !== 'user-abc' = false → slot skipped entirely
    // canManageBookmarks = false → slot skipped entirely
    expect(screen.queryByTestId('follow-button')).toBeNull()
    expect(screen.queryByTestId('subscribe-button')).toBeNull()
  })

  it('signed-in viewing another profile: FollowButton renders; subscribe button is not in hero (moved to aside)', async () => {
    mockCurrentUser = { id: 'user-xyz' } as User
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

  it('shows neutral official badge for redacted official payloads', () => {
    render(<UserProfileHeader user={{ ...baseUser, is_official_account: true }} />)
    expect(screen.getByText('official')).toBeDefined()
    expect(screen.queryByTestId('agent-badge')).toBeNull()
  })

  it('derives the agent badge for private user payloads', () => {
    render(
      <UserProfileHeader user={{ ...baseUser, is_agent: true, is_official_account: undefined }} />,
    )
    expect(screen.getByTestId('agent-badge')).toBeDefined()
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
