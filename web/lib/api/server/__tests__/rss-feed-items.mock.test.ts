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

import { ApiError } from '../../error'
import { getUserRssFeedItemsCollection } from '../rss-feed-items'

describe('rss-feed-items server api helpers', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue({ results: [] })
  })

  describe('getUserRssFeedItemsCollection', () => {
    it('calls the correct endpoint without mediaType', async () => {
      await getUserRssFeedItemsCollection('user-123', 'saved')

      expect(mockGet).toHaveBeenCalledWith('/api/v1/users/user-123/rss-feed-items/saved', undefined)
    })

    it('calls the correct endpoint with mediaType', async () => {
      await getUserRssFeedItemsCollection('user-123', 'hidden', { mediaType: 'article' })

      expect(mockGet).toHaveBeenCalledWith('/api/v1/users/user-123/rss-feed-items/hidden', {
        searchParams: { media_type: 'article' },
      })
    })

    it('returns null for 401/403/404 responses', async () => {
      mockGet.mockRejectedValue(new ApiError('Not Found', 404))

      const result = await getUserRssFeedItemsCollection('user-123', 'viewed')
      expect(result).toBeNull()
    })
  })
})
