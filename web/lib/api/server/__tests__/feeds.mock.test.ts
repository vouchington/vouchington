import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('../instance'),
  () =>
    ({
      serverApi: {
        get: mockGet,
      },
    }) as unknown as typeof import('../instance'),
)

vi.mock<typeof import('react')>(import('react'), async importOriginal => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    cache: ((fn: (...args: never[]) => unknown) => fn) as unknown as typeof actual.cache,
  }
})

import { getReferralLinksFeed } from '../feeds'

describe('feeds server api helpers', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue({})
  })

  describe('getReferralLinksFeed', () => {
    it('calls the correct endpoint for follow_users', async () => {
      await getReferralLinksFeed('follow_users', { searchParams: { limit: 25 } })

      expect(mockGet).toHaveBeenCalledWith('/api/v1/feeds/referral_links/follow_users', {
        searchParams: { limit: 25 },
      })
    })

    it('calls the correct endpoint for mutual_follows', async () => {
      await getReferralLinksFeed('mutual_follows', { searchParams: { limit: 25 } })

      expect(mockGet).toHaveBeenCalledWith('/api/v1/feeds/referral_links/mutual_follows', {
        searchParams: { limit: 25 },
      })
    })
  })
})
