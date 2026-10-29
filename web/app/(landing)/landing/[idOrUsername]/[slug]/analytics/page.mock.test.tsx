import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createNavMock, navMockModule } from 'vouchington-tooling/next-navigation-mock'
import AdminLandingPageAnalyticsPage from './page'

const {
  mockRequireAdmin,
  mockGetAdminLandingPageAnalytics,
  mockGetAdminLandingPageCanonicalIdentity,
  mockGetUserProfile,
  mockNotFound,
  mockPermanentRedirect,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn<VitestLooseMock>(),
  mockGetAdminLandingPageAnalytics: vi.fn<VitestLooseMock>(),
  mockGetAdminLandingPageCanonicalIdentity: vi.fn<VitestLooseMock>(),
  mockGetUserProfile: vi.fn<VitestLooseMock>(),
  mockNotFound: vi.fn<VitestLooseMock>(() => {
    throw new Error('notFound')
  }),
  mockPermanentRedirect: vi.fn<VitestLooseMock>(() => {
    throw new Error('permanentRedirect')
  }),
}))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      ...navMockModule,
      notFound: mockNotFound,
      permanentRedirect: mockPermanentRedirect,
    }) as unknown as typeof import('next/navigation'),
)
vi.mock(import('@/lib/auth/require-admin'), () => ({ requireAdmin: mockRequireAdmin }))
vi.mock(import('@/lib/api/server/admin-landing-pages'), () => ({
  getAdminLandingPageAnalytics: mockGetAdminLandingPageAnalytics,
  getAdminLandingPageCanonicalIdentity: mockGetAdminLandingPageCanonicalIdentity,
}))
vi.mock(import('@/lib/api/server/users'), () => ({ getUserProfile: mockGetUserProfile }))
vi.mock(import('@/components/page-with-aside'), () => ({
  PageWithAside: ({ children }: { children: React.ReactNode }) => (
    <main data-testid='admin-frame'>{children}</main>
  ),
}))
vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>(() => ({})),
}))
vi.mock(import('@/components/my/landing-page-analytics-dashboard'), () => ({
  LandingPageAnalyticsDashboard: ({
    analytics,
    items,
  }: {
    analytics: { total_visits: number }
    items: Array<{ id: string }>
  }) => (
    <div>
      <div data-testid='analytics-total'>{analytics.total_visits}</div>
      <div data-testid='analytics-items'>{items.length}</div>
    </div>
  ),
}))

describe('AdminLandingPageAnalyticsPage', () => {
  const nav = createNavMock()
  beforeEach(() => {
    vi.clearAllMocks()
    nav.reset()
    mockRequireAdmin.mockResolvedValue(undefined)
    mockGetAdminLandingPageAnalytics.mockResolvedValue({
      landing_page: { items: [{ id: 'item-1' }] },
      analytics: { total_visits: 17 },
    })
  })

  it('renders the landing page analytics dashboard', async () => {
    render(
      await AdminLandingPageAnalyticsPage({
        params: Promise.resolve({ idOrUsername: 'alice', slug: 'bonus' }),
      }),
    )

    expect(screen.getByTestId('analytics-total').textContent).toBe('17')
    expect(screen.getByTestId('analytics-items').textContent).toBe('1')
    expect(mockGetAdminLandingPageAnalytics).toHaveBeenCalledWith('alice', 'bonus')
    expect(screen.getByTestId('admin-frame')).toBeVisible()
    expect(screen.getByRole('link', { name: /landing page/i })).toHaveAttribute(
      'href',
      '/@alice/bonus',
    )
  })

  it('calls notFound when analytics are missing', async () => {
    mockGetAdminLandingPageAnalytics.mockResolvedValue(null)

    await expect(
      AdminLandingPageAnalyticsPage({
        params: Promise.resolve({ idOrUsername: 'alice', slug: 'bonus' }),
      }),
    ).rejects.toThrow('notFound')
  })

  it('calls notFound when analytics fail to load', async () => {
    mockGetAdminLandingPageAnalytics.mockRejectedValue(new Error('timeout'))

    await expect(
      AdminLandingPageAnalyticsPage({
        params: Promise.resolve({ idOrUsername: 'alice', slug: 'bonus' }),
      }),
    ).rejects.toThrow('notFound')
  })

  it('redirects an owner UUID to the canonical username only after analytics access succeeds', async () => {
    const ownerId = '019e0000-0000-7000-8000-000000000007'
    mockGetUserProfile.mockResolvedValue({ user: { id: ownerId, username: 'alice' } })
    await expect(
      AdminLandingPageAnalyticsPage({
        params: Promise.resolve({ idOrUsername: ownerId, slug: 'bonus' }),
      }),
    ).rejects.toThrow('permanentRedirect')
    expect(mockGetAdminLandingPageAnalytics).toHaveBeenCalledWith('alice', 'bonus')
    expect(mockPermanentRedirect).toHaveBeenCalledWith('/landing/alice/bonus/analytics')
  })

  it('resolves a page UUID and refuses a different owner before analytics', async () => {
    const pageId = '019e0000-0000-7000-8000-000000000008'
    mockGetUserProfile.mockResolvedValue({ user: { id: 'owner-1', username: 'alice' } })
    mockGetAdminLandingPageCanonicalIdentity.mockResolvedValue({
      owner_user_id: 'owner-2',
      owner_username: 'bob',
      page_slug: 'bonus',
    })
    await expect(
      AdminLandingPageAnalyticsPage({
        params: Promise.resolve({ idOrUsername: 'alice', slug: pageId }),
      }),
    ).rejects.toThrow('notFound')
    expect(mockGetAdminLandingPageAnalytics).not.toHaveBeenCalled()
  })

  it('redirects a page UUID for the matching owner to its slug', async () => {
    const pageId = '019e0000-0000-7000-8000-000000000008'
    mockGetUserProfile.mockResolvedValue({ user: { id: 'owner-1', username: 'alice' } })
    mockGetAdminLandingPageCanonicalIdentity.mockResolvedValue({
      owner_user_id: 'owner-1',
      owner_username: 'alice',
      page_slug: 'bonus',
    })
    await expect(
      AdminLandingPageAnalyticsPage({
        params: Promise.resolve({ idOrUsername: 'alice', slug: pageId }),
      }),
    ).rejects.toThrow('permanentRedirect')
    expect(mockGetAdminLandingPageAnalytics).toHaveBeenCalledWith('alice', 'bonus')
    expect(mockPermanentRedirect).toHaveBeenCalledWith('/landing/alice/bonus/analytics')
  })
})
