import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const {
  mockGetCurrentUser,
  mockGetMyLandingPages,
  mockGetMyLandingPage,
  mockGetMyLandingPageAnalytics,
  mockReturnNullForMissingEntity,
  mockNotFound,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn<VitestLooseMock>(),
  mockGetMyLandingPages: vi.fn<VitestLooseMock>(),
  mockGetMyLandingPage: vi.fn<VitestLooseMock>(),
  mockGetMyLandingPageAnalytics: vi.fn<VitestLooseMock>(),
  mockReturnNullForMissingEntity: vi.fn<VitestLooseMock>((p: Promise<unknown>) => p),
  mockNotFound: vi.fn<VitestLooseMock>(() => {
    throw new Error('not-found')
  }),
}))

vi.mock(
  import('next/navigation'),
  () => ({ notFound: mockNotFound }) as unknown as typeof import('next/navigation'),
)
vi.mock(import('@/lib/auth/get-current-user'), () => ({ getCurrentUser: mockGetCurrentUser }))
vi.mock(import('@/lib/api/server'), () => ({
  getMyLandingPages: mockGetMyLandingPages,
  getMyLandingPage: mockGetMyLandingPage,
}))
vi.mock(import('@/lib/api/server/landing-page-analytics'), () => ({
  getMyLandingPageAnalytics: mockGetMyLandingPageAnalytics,
}))
vi.mock(import('@/lib/api/return-null-for-missing-entity'), () => ({
  returnNullForMissingEntity: mockReturnNullForMissingEntity,
}))
vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>(() => ({})),
}))
vi.mock(import('@/components/my/landing-page-analytics-dashboard'), () => ({
  LandingPageAnalyticsDashboard: () => <div data-testid='analytics-dashboard'>dashboard</div>,
}))

import LandingPageAnalyticsPage from './page'

const pageRow = { id: 'page-1', slug: 'my-page' }

describe('LandingPageAnalyticsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetMyLandingPages.mockResolvedValue({ results: [pageRow] })
    mockGetMyLandingPage.mockResolvedValue({ landing_page: { ...pageRow, items: [] } })
    mockGetMyLandingPageAnalytics.mockResolvedValue({ total_visits: 0 })
  })

  it('renders the analytics dashboard for a resolved slug', async () => {
    mockGetCurrentUser.mockResolvedValue({ username: 'tester' })
    render(await LandingPageAnalyticsPage({ params: Promise.resolve({ slug: 'my-page' }) }))
    expect(screen.getByTestId('analytics-dashboard')).toBeDefined()
  })

  it('calls notFound when unauthenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null)
    await expect(
      LandingPageAnalyticsPage({ params: Promise.resolve({ slug: 'my-page' }) }),
    ).rejects.toThrow('not-found')
  })

  it('calls notFound when the slug does not resolve', async () => {
    mockGetCurrentUser.mockResolvedValue({ username: 'tester' })
    await expect(
      LandingPageAnalyticsPage({ params: Promise.resolve({ slug: 'missing' }) }),
    ).rejects.toThrow('not-found')
  })

  it('calls notFound when analytics are missing', async () => {
    mockGetCurrentUser.mockResolvedValue({ username: 'tester' })
    mockGetMyLandingPageAnalytics.mockResolvedValue(null)
    await expect(
      LandingPageAnalyticsPage({ params: Promise.resolve({ slug: 'my-page' }) }),
    ).rejects.toThrow('not-found')
  })
})
