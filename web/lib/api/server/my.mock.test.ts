import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getMyNotifications,
  getMyCards,
  getMySpendingCategories,
  getMyWebPushSubscriptions,
  getMyNotificationRedirectTarget,
  getMyFinancialProfile,
  getMyIdentityVerification,
  getMyFriendRecommendations,
  getMyWarnings,
  getMyCommunities,
  getMyBans,
  getMyRemovedPosts,
  getMyLandingPages,
} from './my'

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

describe('my server api helpers', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue({})
  })

  describe('getMyNotifications', () => {
    it('calls notifications endpoint with no options', async () => {
      await getMyNotifications()
      expect(mockGet).toHaveBeenCalledWith('/api/v1/my/notifications', {
        headers: undefined,
      })
    })

    it('forwards pagination options as searchParams', async () => {
      await getMyNotifications({ after: 'cursor-1', limit: 20 })
      expect(mockGet).toHaveBeenCalledWith('/api/v1/my/notifications', {
        headers: undefined,
        searchParams: { after: 'cursor-1', limit: '20' },
      })
    })
  })

  it('getMyCards forwards pagination options as searchParams', async () => {
    await getMyCards({ after: 'cursor-1', limit: 25 })
    expect(mockGet).toHaveBeenCalledWith('/api/v1/my/cards', {
      headers: undefined,
      searchParams: { after: 'cursor-1', limit: '25' },
    })
  })

  it('getMySpendingCategories forwards pagination options as searchParams', async () => {
    await getMySpendingCategories({ after: 'opaque-cursor', limit: 25 })
    expect(mockGet).toHaveBeenCalledWith('/api/v1/my/spending-categories', {
      headers: undefined,
      searchParams: { after: 'opaque-cursor', limit: 25 },
    })
  })

  it('getMyWebPushSubscriptions calls the push-subscriptions endpoint', async () => {
    await getMyWebPushSubscriptions()
    expect(mockGet).toHaveBeenCalledWith('/api/v1/my/notifications/push-subscriptions', undefined)
  })

  it('getMyNotificationRedirectTarget calls the redirect-target endpoint', async () => {
    await getMyNotificationRedirectTarget('notif-1')
    expect(mockGet).toHaveBeenCalledWith(
      '/api/v1/my/notifications/notif-1/redirect-target',
      undefined,
    )
  })

  it('getMyFinancialProfile calls the financial-profile endpoint', async () => {
    await getMyFinancialProfile()
    expect(mockGet).toHaveBeenCalledWith('/api/v1/my/financial-profile', undefined)
  })

  it('getMyIdentityVerification calls the identity-verification endpoint', async () => {
    await getMyIdentityVerification()
    expect(mockGet).toHaveBeenCalledWith('/api/v1/my/identity-verification', undefined)
  })

  describe('getMyFriendRecommendations', () => {
    it('calls friend-recommendations endpoint with no options', async () => {
      await getMyFriendRecommendations()
      expect(mockGet).toHaveBeenCalledWith('/api/v1/my/friend-recommendations', {
        headers: undefined,
      })
    })

    it('forwards pagination options as searchParams', async () => {
      await getMyFriendRecommendations({ after: 'cursor-1', limit: 10 })
      expect(mockGet).toHaveBeenCalledWith('/api/v1/my/friend-recommendations', {
        headers: undefined,
        searchParams: { after: 'cursor-1', limit: '10' },
      })
    })
  })

  it('getMyWarnings calls the my/warnings endpoint', async () => {
    await getMyWarnings()
    expect(mockGet).toHaveBeenCalledWith('/api/v1/my/warnings', undefined)
  })

  it('getMyCommunities calls the my/communities endpoint', async () => {
    await getMyCommunities()
    expect(mockGet).toHaveBeenCalledWith('/api/v1/my/communities', undefined)
  })

  it('getMyLandingPages calls the my/landing-pages endpoint', async () => {
    await getMyLandingPages()
    expect(mockGet).toHaveBeenCalledWith('/api/v1/my/landing-pages', undefined)
  })

  it('getMyBans calls the my/bans endpoint', async () => {
    await getMyBans()
    expect(mockGet).toHaveBeenCalledWith('/api/v1/my/bans', undefined)
  })

  it('getMyRemovedPosts calls the my/removed-posts endpoint', async () => {
    await getMyRemovedPosts()
    expect(mockGet).toHaveBeenCalledWith('/api/v1/my/removed-posts', {
      searchParams: { include_platform: 'true' },
    })
  })
})
