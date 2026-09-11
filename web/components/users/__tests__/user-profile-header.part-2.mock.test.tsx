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
  FollowButton: () => <div data-testid='follow-button' />,
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

  it('does not render profile links when profileLinks is undefined', () => {
    render(<UserProfileHeader user={baseUser} />)
    expect(screen.queryByTestId('user-profile-links')).toBeNull()
  })

  it('renders MarkdownContent with the given aboutHtml, line-clamp class, and UTM features', () => {
    render(
      <UserProfileHeader
        user={baseUser}
        aboutHtml='<p>Hello world</p>'
      />,
    )
    const el = screen.getByTestId('markdown-content')
    expect(el).toBeDefined()
    expect(el.getAttribute('data-html')).toBe('<p>Hello world</p>')
    expect(el.getAttribute('data-classname')).toContain('line-clamp-4')
    expect(el.getAttribute('data-features')).toBe('{"utm":true}')
  })

  it('does not render MarkdownContent when aboutHtml is null', () => {
    render(
      <UserProfileHeader
        user={baseUser}
        aboutHtml={null}
      />,
    )
    expect(screen.queryByTestId('markdown-content')).toBeNull()
  })

  it('does not render MarkdownContent when aboutHtml is undefined', () => {
    render(<UserProfileHeader user={baseUser} />)
    expect(screen.queryByTestId('markdown-content')).toBeNull()
  })

  it('renders IdentityVerifiedBadge when verification_status=verified and verified_badge_visible=true', () => {
    render(
      <UserProfileHeader
        user={{ ...baseUser, verification_status: 'verified', verified_badge_visible: true }}
      />,
    )
    expect(screen.getByTestId('identity-verified-badge')).toBeDefined()
  })

  it('does not render IdentityVerifiedBadge when verification_status=verified but verified_badge_visible=false', () => {
    render(
      <UserProfileHeader
        user={{ ...baseUser, verification_status: 'verified', verified_badge_visible: false }}
      />,
    )
    expect(screen.queryByTestId('identity-verified-badge')).toBeNull()
  })

  it('does not render IdentityVerifiedBadge when verification_status is not verified', () => {
    render(
      <UserProfileHeader
        user={{ ...baseUser, verification_status: 'unverified', verified_badge_visible: true }}
      />,
    )
    expect(screen.queryByTestId('identity-verified-badge')).toBeNull()
  })

  it('does not render IdentityVerifiedBadge when verification fields are absent', () => {
    render(<UserProfileHeader user={baseUser} />)
    expect(screen.queryByTestId('identity-verified-badge')).toBeNull()
  })

  it('renders verified_display_name when present', () => {
    render(<UserProfileHeader user={{ ...baseUser, verified_display_name: 'Alice S.' }} />)
    expect(screen.getByText('Alice S.')).toBeDefined()
  })

  it('does not render verified_display_name when absent', () => {
    render(<UserProfileHeader user={baseUser} />)
    // Alice Example (display name) is present, but no separate verified_display_name paragraph
    expect(screen.queryByText(/^Alice S\./)).toBeNull()
  })
})
