import { isValidElement } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import UserAdminPage from './page'

const {
  mockGetCurrentUser,
  mockGetUserProfile,
  mockGetUserPreservationHoldState,
  mockNotFound,
  mockGetAdminLandingPagesForUser,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn<VitestLooseMock>(),
  mockGetUserProfile: vi.fn<VitestLooseMock>(),
  mockGetUserPreservationHoldState: vi.fn<VitestLooseMock>(),
  mockNotFound: vi.fn<VitestLooseMock>(() => {
    throw new Error('notFound')
  }),
  mockGetAdminLandingPagesForUser: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('next/navigation'),
  () => ({ notFound: mockNotFound }) as unknown as typeof import('next/navigation'),
)
vi.mock(import('@/lib/api/server'), () => ({
  GET_USER_PROFILE_WITH_BIO: { includeBio: true } as const,
  getUserProfile: mockGetUserProfile,
  getUserPreservationHoldState: mockGetUserPreservationHoldState,
}))
vi.mock(import('@/lib/api/server/admin-landing-pages'), () => ({
  getAdminLandingPagesForUser: mockGetAdminLandingPagesForUser,
}))
vi.mock(import('@/lib/auth/get-current-user'), () => ({ getCurrentUser: mockGetCurrentUser }))
vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>(() => ({ robots: { index: false } })),
}))
vi.mock(import('./user-admin-panel'), () => ({
  UserAdminPanel: () => <div>User admin panel</div>,
}))
vi.mock(
  import('./landing-page-analytics-card'),
  () =>
    ({
      LandingPageAnalyticsCard: () => <div>Landing page analytics card</div>,
    }) as unknown as typeof import('./landing-page-analytics-card'),
)
vi.mock(import('./membership-refund-panel'), () => ({
  MembershipRefundPanel: (props: { actorUserId: string; userId: string }) => (
    <div
      data-testid='membership-refund-panel'
      data-actor-user-id={props.actorUserId}
      data-user-id={props.userId}
    >
      Membership refund panel
    </div>
  ),
}))
vi.mock(
  import('./deleted-user-preservation-hold-panel'),
  () =>
    ({
      DeletedUserPreservationHoldPanel: ({ userId }: { userId: string }) => (
        <div data-testid='deleted-account-hold-panel'>{userId}</div>
      ),
    }) as unknown as typeof import('./deleted-user-preservation-hold-panel'),
)

const adminUser = {
  id: 'admin-1',
  username: 'admin',
  email_address: 'tests+admin@voucha.ai',
  roles: ['administrator'],
}

const profileUser = {
  id: 'user-1',
  username: 'alice',
  email_address: 'tests+alice@voucha.ai',
  roles: [],
}

describe('UserAdminPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCurrentUser.mockResolvedValue(adminUser)
    mockGetUserProfile.mockResolvedValue({ user: profileUser })
    mockGetUserPreservationHoldState.mockResolvedValue(null)
    mockGetAdminLandingPagesForUser.mockResolvedValue({ results: [] })
  })

  it('keys the admin panel by user id so local state resets when users change', async () => {
    const result = await UserAdminPage({ params: Promise.resolve({ idOrUsername: 'alice' }) })

    expect(isValidElement(result)).toBe(true)
    expect(result.key).toBe('user-1')
    expect(mockGetUserProfile).toHaveBeenCalledWith('alice', { includeBio: true })
  })

  it('scopes membership refund attempts to the signed-in actor and target user', async () => {
    const result = await UserAdminPage({ params: Promise.resolve({ idOrUsername: 'alice' }) })
    render(result)

    const panel = screen.getByTestId('membership-refund-panel')
    expect(panel).toHaveAttribute('data-actor-user-id', 'admin-1')
    expect(panel).toHaveAttribute('data-user-id', 'user-1')
  })

  it('returns not found for non-administrators', async () => {
    mockGetCurrentUser.mockResolvedValue({ ...adminUser, roles: [] })

    await expect(
      UserAdminPage({ params: Promise.resolve({ idOrUsername: 'alice' }) }),
    ).rejects.toThrow('notFound')
    expect(mockGetUserProfile).not.toHaveBeenCalled()
  })

  it('shows the landing-page analytics card for administrators', async () => {
    const result = await UserAdminPage({ params: Promise.resolve({ idOrUsername: 'alice' }) })
    render(result)

    expect(isValidElement(result)).toBe(true)
    expect(mockGetAdminLandingPagesForUser).toHaveBeenCalledWith('user-1')
    expect(screen.getByText('Landing page analytics card')).toBeInTheDocument()
  })

  it('renders the admin and refund panels when landing-page analytics fail to load', async () => {
    mockGetAdminLandingPagesForUser.mockRejectedValueOnce(new Error('timeout'))

    const result = await UserAdminPage({ params: Promise.resolve({ idOrUsername: 'alice' }) })
    render(result)

    expect(isValidElement(result)).toBe(true)
    expect(mockGetAdminLandingPagesForUser).toHaveBeenCalledWith('user-1')
    expect(screen.getByText('User admin panel')).toBeInTheDocument()
    expect(screen.getByText('Membership refund panel')).toBeInTheDocument()
    expect(screen.queryByText('Landing page analytics card')).toBeNull()
  })

  it('renders only preservation hold controls for a soft-deleted UUID account', async () => {
    const userId = '018f47a0-25cb-7a45-8b54-304f77ce64c0'
    mockGetUserProfile.mockResolvedValue(null)
    mockGetUserPreservationHoldState.mockResolvedValue({
      account_deleted_at: '2026-01-02T03:04:05.000Z',
      holds: [],
    })

    const result = await UserAdminPage({ params: Promise.resolve({ idOrUsername: userId }) })
    render(result)

    expect(result.key).toBe(userId)
    expect(screen.getByTestId('deleted-account-hold-panel')).toHaveTextContent(userId)
    expect(screen.queryByText('User admin panel')).toBeNull()
    expect(screen.queryByText('Membership refund panel')).toBeNull()
  })

  it.each([
    ['a username', 'missing-user', null],
    ['an unknown UUID', '018f47a0-25cb-7a45-8b54-304f77ce64c0', null],
    [
      'a live UUID whose profile is unavailable',
      '018f47a0-25cb-7a45-8b54-304f77ce64c0',
      { account_deleted_at: null, holds: [] },
    ],
  ])('returns not found for %s', async (_label, idOrUsername, holdState) => {
    mockGetUserProfile.mockResolvedValue(null)
    mockGetUserPreservationHoldState.mockResolvedValue(holdState)

    await expect(UserAdminPage({ params: Promise.resolve({ idOrUsername }) })).rejects.toThrow(
      'notFound',
    )
  })
})
