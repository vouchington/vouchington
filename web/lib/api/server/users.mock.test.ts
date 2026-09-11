import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getUsersSearchResults,
  getUserCommunitiesCollection,
  getUserHostnamesCollection,
  getUserPostsCollection,
  getUserRssFeedsCollection,
  getUserUrlsCollection,
} from './users'
import type { RssFeedsListResponseBody } from '@/types/api-responses'

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn<VitestLooseMock>(),
}))

function makeRssFeedsListResponse(): RssFeedsListResponseBody {
  return {
    results: [],
    page_info: {
      has_next_page: false,
      start_cursor: null,
      end_cursor: null,
    },
    topic_elections: {},
    hostname_elections: {},
  }
}

vi.mock(
  import('./instance'),
  () =>
    ({
      serverApi: {
        get: mockGet,
      },
    }) as unknown as typeof import('./instance'),
)

vi.mock(
  import('../return-null-for-missing-entity'),
  () =>
    ({
      returnNullForMissingEntity: async (promise: Promise<unknown>) => {
        return promise
      },
    }) as unknown as typeof import('../return-null-for-missing-entity'),
)

describe('user server api collection helpers', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue(null)
  })

  it('encodes post collection routes', async () => {
    await getUserPostsCollection('user/name', 'saved')

    expect(mockGet).toHaveBeenCalledWith('/api/v1/users/user%2Fname/posts/saved', undefined)
  })

  it('forwards post collection limit and cursor parameters', async () => {
    await getUserPostsCollection('user/name', 'saved', {
      after: 'opaque-cursor',
      limit: 25,
    })

    expect(mockGet).toHaveBeenCalledWith('/api/v1/users/user%2Fname/posts/saved', {
      searchParams: { after: 'opaque-cursor', limit: 25 },
    })
  })

  it('encodes url collection routes', async () => {
    await getUserUrlsCollection('user/name', 'saved')

    expect(mockGet).toHaveBeenCalledWith('/api/v1/users/user%2Fname/urls/saved', undefined)
  })

  it('encodes hostname collection routes', async () => {
    await getUserHostnamesCollection('user/name', 'muted')

    expect(mockGet).toHaveBeenCalledWith('/api/v1/users/user%2Fname/domains/muted', undefined)
  })

  it('encodes community collection routes', async () => {
    await getUserCommunitiesCollection('user/name', 'proxy-muted')

    expect(mockGet).toHaveBeenCalledWith(
      '/api/v1/users/user%2Fname/communities/proxy-muted',
      undefined,
    )
  })

  it('fetches RSS feed collections with default parameters', async () => {
    const response = makeRssFeedsListResponse()
    mockGet.mockResolvedValue(response)

    const result = await getUserRssFeedsCollection('user/name')

    expect(result).toBe(response)
    expect(mockGet).toHaveBeenCalledWith('/api/v1/users/user%2Fname/rss-feeds/following', undefined)
  })

  it('fetches RSS feed collections with feed_type query param', async () => {
    const response = makeRssFeedsListResponse()
    mockGet.mockResolvedValue(response)

    const result = await getUserRssFeedsCollection('user/name', 'subscribed', { feedType: 'video' })

    expect(result).toBe(response)
    expect(mockGet).toHaveBeenCalledWith('/api/v1/users/user%2Fname/rss-feeds/subscribed', {
      searchParams: { feed_type: 'video' },
    })
  })

  it('fetches user search results with query and limit', async () => {
    await getUsersSearchResults({ q: 'ada', limit: 5 })

    expect(mockGet).toHaveBeenCalledWith('/api/v1/users', {
      searchParams: { q: 'ada', limit: 5 },
    })
  })

  it('forwards the cursor when continuing user search results', async () => {
    await getUsersSearchResults({ q: 'ada', after: 'opaque-cursor', limit: 5 })

    expect(mockGet).toHaveBeenCalledWith('/api/v1/users', {
      searchParams: { q: 'ada', after: 'opaque-cursor', limit: 5 },
    })
  })
})
