/* oxlint-disable no-mistakes/playwright-consistent-attribute -- moved test support preserves existing Testing Library selectors */
import React, { type ReactNode } from 'react'
import { createNavMock, navMockModule } from '@/test-helpers/next-navigation-mock'
import type { User } from '@/types/user'
import { vi } from 'vitest'

const mockNav = createNavMock()
const mockProfileAuth: { currentUser: User | null } = { currentUser: null }

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

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
        // oxlint-disable-next-line react/only-export-components -- next/dynamic test double, never fast-refreshed
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

vi.mock(
  import('@/lib/auth/context'),
  () =>
    ({
      useAuth: () => ({
        currentUser: mockProfileAuth.currentUser,
        isAuthenticated: mockProfileAuth.currentUser !== null,
        logout: vi.fn<() => Promise<void>>(),
        setUser: vi.fn<(user: User | null) => void>(),
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

vi.mock(import('@/components/users/identity-verified-badge'), () => ({
  IdentityVerifiedBadge: () => <div data-testid='identity-verified-badge' />,
}))

vi.mock(import('@/components/users/profile-links'), () => ({
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

function resetUserProfileHeaderDoubles() {
  mockNav.reset()
  mockProfileAuth.currentUser = null
}

export { baseUser, mockNav, mockProfileAuth, resetUserProfileHeaderDoubles }
