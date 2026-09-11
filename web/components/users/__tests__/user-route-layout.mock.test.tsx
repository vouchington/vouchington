import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetCurrentUser, mockUserDetailLayout } = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn<VitestLooseMock>(),
  mockUserDetailLayout: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('@/lib/api/server'),
  () =>
    ({
      getUserProfile: vi.fn<VitestLooseMock>(() =>
        Promise.resolve({
          user: { id: 'u1', username: 'alice', display_name: 'Alice' },
          user_metrics: null,
          profile_links: [],
          user_bio_html: null,
        }),
      ),
      GET_USER_PROFILE_WITH_BIO: 'GET_USER_PROFILE_WITH_BIO',
    }) as unknown as typeof import('@/lib/api/server'),
)

vi.mock(import('@/lib/auth/get-current-user'), () => ({ getCurrentUser: mockGetCurrentUser }))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      notFound: vi.fn<VitestLooseMock>(() => {
        throw new Error('notFound')
      }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/links/entity-href'), () => ({
  createUserPathname: vi.fn<VitestLooseMock>(() => '/user/alice'),
}))

vi.mock(import('@/lib/seo/structured-data'), () => ({
  createBreadcrumbSchema: vi.fn<VitestLooseMock>(() => ({})),
}))

vi.mock(
  import('@/components/seo/anonymous-structured-data-script'),
  () =>
    ({
      AnonymousStructuredDataScript: () => null,
    }) as unknown as typeof import('@/components/seo/anonymous-structured-data-script'),
)

vi.mock(import('@/lib/users/user-helpers'), () => ({
  getDisplayName: vi.fn<VitestLooseMock>(
    (user: { display_name?: string; username: string }) => user.display_name ?? user.username,
  ),
  isProfileOwner: vi.fn<VitestLooseMock>(() => false),
}))

vi.mock(import('../user-detail-layout'), () => ({
  UserDetailLayout: ({ children, ...props }: { children: React.ReactNode }) => {
    mockUserDetailLayout(props)
    return <div data-testid='user-detail-layout'>{children}</div>
  },
}))

vi.mock(
  import('../user-signal-election-card'),
  () =>
    ({
      UserSignalElectionCard: () => null,
    }) as unknown as typeof import('../user-signal-election-card'),
)

vi.mock(
  import('../user-vouch-election-card'),
  () =>
    ({
      UserVouchElectionCard: () => null,
    }) as unknown as typeof import('../user-vouch-election-card'),
)

vi.mock(import('../user-actions-aside'), () => ({
  UserActionsAside: () => null,
}))

import { UserRouteLayout } from '../user-route-layout'

describe('UserRouteLayout', () => {
  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(null)
    mockUserDetailLayout.mockReset()
  })

  it('renders UserDetailLayout when user profile is found', async () => {
    const result = await UserRouteLayout({
      idOrUsername: 'alice',
      children: <div>content</div>,
    })
    render(result)
    expect(screen.getByTestId('user-detail-layout')).toHaveTextContent('content')
  })

  it('allows a non-official viewer to manage user-tag relations', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'viewer-1', roles: ['user'] })

    render(await UserRouteLayout({ idOrUsername: 'alice', children: <div>content</div> }))

    expect(mockUserDetailLayout.mock.lastCall?.[0]?.asides).toMatchObject({
      canManageUserTags: true,
    })
  })

  it('prevents a non-admin official viewer from managing user-tag relations', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'viewer-1', roles: ['investor'] })

    render(await UserRouteLayout({ idOrUsername: 'alice', children: <div>content</div> }))

    expect(mockUserDetailLayout.mock.lastCall?.[0]?.asides).toMatchObject({
      canManageUserTags: false,
    })
  })

  it('allows an administrator official viewer to manage user-tag relations', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'viewer-1', roles: ['administrator'] })

    render(await UserRouteLayout({ idOrUsername: 'alice', children: <div>content</div> }))

    expect(mockUserDetailLayout.mock.lastCall?.[0]?.asides).toMatchObject({
      canManageUserTags: true,
    })
  })
})
