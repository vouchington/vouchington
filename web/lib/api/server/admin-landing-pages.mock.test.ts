import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getAdminLandingPageAnalytics,
  getAdminLandingPageCanonicalIdentity,
  getAdminLandingPagesForUser,
} from './admin-landing-pages'
import { ApiError } from '@vouchington/api-client'
import { expectApiWrapperCall } from '@/test-helpers/api-wrapper'

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

  it('calls the admin landing page analytics endpoint with owner and page slugs', async () => {
    const headers = { cookie: 'session=1' }
    await getAdminLandingPageAnalytics('alice', 'bonus', { headers })

    expect(mockGet).toHaveBeenCalledWith(
      '/api/v1/admin/users/alice/landing-pages/bonus/analytics',
      {
        headers,
      },
    )
  })

  it('returns null for missing admin landing page analytics', async () => {
    mockGet.mockRejectedValue(new ApiError('Not found', 404))

    await expect(getAdminLandingPageAnalytics('alice', 'missing-page')).resolves.toBeNull()
  })

  it('resolves a landing page ID through the admin identity endpoint', async () => {
    const response = {
      owner_user_id: 'user-1',
      owner_username: 'alice',
      page_slug: 'bonus',
    }
    const headers = { cookie: 'session=1' }
    await expectApiWrapperCall({
      mock: mockGet,
      response,
      call: () =>
        getAdminLandingPageCanonicalIdentity('page/1', { headers }) as Promise<typeof response>,
      expectedArgs: ['/api/v1/admin/landing-pages/page%2F1', { headers }],
    })
  })

  it('returns null when a landing page ID is missing', async () => {
    mockGet.mockRejectedValue(new ApiError('Not found', 404))
    await expect(getAdminLandingPageCanonicalIdentity('missing-page')).resolves.toBeNull()
  })
})
