import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAdminLandingPageAnalytics, getAdminLandingPagesForUser } from './admin-landing-pages'
import { ApiError } from '../error'

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('./instance'),
  () =>
    ({
      serverApi: {
        get: mockGet,
      },
    }) as unknown as typeof import('./instance'),
)

describe('admin landing pages server api helpers', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue({})
  })

  it('calls the admin user landing pages endpoint with encoded user id and headers', async () => {
    const headers = { cookie: 'session=1' }
    await getAdminLandingPagesForUser('user/1', { headers })

    expect(mockGet).toHaveBeenCalledWith('/api/v1/admin/users/user%2F1/landing-pages', {
      headers,
    })
  })

  it('returns null for missing admin user landing pages', async () => {
    mockGet.mockRejectedValue(new ApiError('Not found', 404))

    await expect(getAdminLandingPagesForUser('missing-user')).resolves.toBeNull()
  })

  it('calls the admin landing page analytics endpoint with encoded page id and headers', async () => {
    const headers = { cookie: 'session=1' }
    await getAdminLandingPageAnalytics('page/1', { headers })

    expect(mockGet).toHaveBeenCalledWith('/api/v1/admin/landing-pages/page%2F1/analytics', {
      headers,
    })
  })

  it('returns null for missing admin landing page analytics', async () => {
    mockGet.mockRejectedValue(new ApiError('Not found', 404))

    await expect(getAdminLandingPageAnalytics('missing-page')).resolves.toBeNull()
  })
})
