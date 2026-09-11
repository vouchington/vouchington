import { isValidElement } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import UserAdminPage from './page'

const { mockGetCurrentUser, mockGetUserProfile, mockNotFound, mockGetAdminLandingPagesForUser } =
  vi.hoisted(() => ({
    mockGetCurrentUser: vi.fn<VitestLooseMock>(),
    mockGetUserProfile: vi.fn<VitestLooseMock>(),
    mockNotFound: vi.fn<VitestLooseMock>(() => {
      throw new Error('notFound')
    }),
    mockGetAdminLandingPagesForUser: vi.fn<VitestLooseMock>(),
  }))

vi.mock(
  import('next/navigation'),
  () => ({ notFound: mockNotFound }) as unknown as typeof import('next/navigation'),
)
vi.mock(import('@/lib/api/server'), () => ({ getUserProfile: mockGetUserProfile }))
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
    mockGetAdminLandingPagesForUser.mockResolvedValue({ results: [] })
  })

  it('keys the admin panel by user id so local state resets when users change', async () => {
    const result = await UserAdminPage({ params: Promise.resolve({ idOrUsername: 'alice' }) })

    expect(isValidElement(result)).toBe(true)
    expect(result.key).toBe('user-1')
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

  it('shows the landing-page analytics card only for administrators', async () => {
    const adminResult = await UserAdminPage({ params: Promise.resolve({ idOrUsername: 'alice' }) })
    render(adminResult)

    expect(isValidElement(adminResult)).toBe(true)
    expect(mockGetAdminLandingPagesForUser).toHaveBeenCalledWith('user-1')
    expect(screen.getByText('Landing page analytics card')).toBeInTheDocument()

    mockGetCurrentUser.mockResolvedValue({ ...adminUser, roles: ['customer_support'] })
    mockGetAdminLandingPagesForUser.mockClear()
    cleanup()
    const csResult = await UserAdminPage({ params: Promise.resolve({ idOrUsername: 'alice' }) })
    render(csResult)

    expect(isValidElement(csResult)).toBe(true)
    expect(screen.queryByText('Landing page analytics card')).toBeNull()
    expect(screen.getByText('Membership refund panel')).toBeInTheDocument()
    expect(mockGetAdminLandingPagesForUser).not.toHaveBeenCalled()
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
})
