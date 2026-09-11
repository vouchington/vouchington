import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminLandingPageAnalyticsPage from './page'

const { mockRequireAdmin, mockGetAdminLandingPageAnalytics, mockNotFound } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn<VitestLooseMock>(),
  mockGetAdminLandingPageAnalytics: vi.fn<VitestLooseMock>(),
  mockNotFound: vi.fn<VitestLooseMock>(() => {
    throw new Error('notFound')
  }),
}))

vi.mock(
  import('next/navigation'),
  () => ({ notFound: mockNotFound }) as unknown as typeof import('next/navigation'),
)
vi.mock(import('@/lib/auth/require-admin'), () => ({ requireAdmin: mockRequireAdmin }))
vi.mock(import('@/lib/api/server/admin-landing-pages'), () => ({
  getAdminLandingPageAnalytics: mockGetAdminLandingPageAnalytics,
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
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAdmin.mockResolvedValue(undefined)
    mockGetAdminLandingPageAnalytics.mockResolvedValue({
      landing_page: { items: [{ id: 'item-1' }] },
      analytics: { total_visits: 17 },
    })
  })

  it('renders the landing page analytics dashboard', async () => {
    render(await AdminLandingPageAnalyticsPage({ params: Promise.resolve({ pageId: 'page-1' }) }))

    expect(screen.getByTestId('analytics-total').textContent).toBe('17')
    expect(screen.getByTestId('analytics-items').textContent).toBe('1')
    expect(mockGetAdminLandingPageAnalytics).toHaveBeenCalledWith('page-1')
  })

  it('calls notFound when analytics are missing', async () => {
    mockGetAdminLandingPageAnalytics.mockResolvedValue(null)

    await expect(
      AdminLandingPageAnalyticsPage({ params: Promise.resolve({ pageId: 'page-1' }) }),
    ).rejects.toThrow('notFound')
  })

  it('calls notFound when analytics fail to load', async () => {
    mockGetAdminLandingPageAnalytics.mockRejectedValue(new Error('timeout'))

    await expect(
      AdminLandingPageAnalyticsPage({ params: Promise.resolve({ pageId: 'page-1' }) }),
    ).rejects.toThrow('notFound')
  })
})
