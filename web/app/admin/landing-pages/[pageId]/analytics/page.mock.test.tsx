import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createNavMock, navMockModule } from 'vouchington-tooling/next-navigation-mock'

const { requireAdminMock, identityMock, analyticsMock, notFoundMock, permanentRedirectMock } =
  vi.hoisted(() => ({
    requireAdminMock: vi.fn<VitestLooseMock>(),
    identityMock: vi.fn<VitestLooseMock>(),
    analyticsMock: vi.fn<VitestLooseMock>(),
    notFoundMock: vi.fn<VitestLooseMock>(() => {
      throw new Error('NEXT_NOT_FOUND')
    }),
    permanentRedirectMock: vi.fn<VitestLooseMock>(() => {
      throw new Error('NEXT_PERMANENT_REDIRECT')
    }),
  }))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      ...navMockModule,
      notFound: notFoundMock,
      permanentRedirect: permanentRedirectMock,
    }) as unknown as typeof import('next/navigation'),
)
vi.mock(import('@/lib/auth/require-admin'), () => ({ requireAdmin: requireAdminMock }))
vi.mock(import('@/lib/api/server/admin-landing-pages'), () => ({
  getAdminLandingPageCanonicalIdentity: identityMock,
  getAdminLandingPageAnalytics: analyticsMock,
}))
vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>(() => ({})),
}))

import LegacyAdminLandingPageAnalyticsPage from './page'

const pageId = '019e0000-0000-7000-8000-000000000009'
const params = Promise.resolve({ pageId })
const nav = createNavMock()

describe('LegacyAdminLandingPageAnalyticsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    nav.reset()
    requireAdminMock.mockResolvedValue(undefined)
    identityMock.mockResolvedValue({
      owner_user_id: 'owner-1',
      owner_username: 'alice',
      page_slug: 'bonus',
    })
    analyticsMock.mockResolvedValue({ landing_page: { id: pageId } })
  })

  it('resolves a page ID and redirects an admin to the canonical analytics route', async () => {
    await expect(LegacyAdminLandingPageAnalyticsPage({ params })).rejects.toThrow(
      'NEXT_PERMANENT_REDIRECT',
    )
    expect(requireAdminMock).toHaveBeenCalledOnce()
    expect(identityMock).toHaveBeenCalledWith(pageId)
    expect(analyticsMock).toHaveBeenCalledWith('alice', 'bonus')
    expect(permanentRedirectMock).toHaveBeenCalledWith('/landing/alice/bonus/analytics')
  })

  it('does not resolve page IDs when admin authorization fails', async () => {
    requireAdminMock.mockRejectedValue(new Error('UNAUTHORIZED'))
    await expect(LegacyAdminLandingPageAnalyticsPage({ params })).rejects.toThrow('UNAUTHORIZED')
    expect(identityMock).not.toHaveBeenCalled()
  })

  it('does not redirect for an unknown page ID', async () => {
    identityMock.mockResolvedValue(null)
    await expect(LegacyAdminLandingPageAnalyticsPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(analyticsMock).not.toHaveBeenCalled()
  })
})
