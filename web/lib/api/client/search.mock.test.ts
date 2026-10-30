import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchCombinedSearch } from './search'

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('./instance'),
  () =>
    ({
      clientApi: {
        get: mockGet,
      },
    }) as unknown as typeof import('./instance'),
)

const baseResponse = {
  topics: [{ id: 't1', name: 'TypeScript', slug: 'typescript', topic_type: 'topic' }],
  posts: [{ id: 'p1', post_type: 'text', title: 'My Post' }],
  news: [
    { id: 'n1', url: 'https://example.com/news', title: 'Breaking News', feed_title: 'Tech Feed' },
  ],
  domains: [{ id: 'd1', hostname: 'example.com' }],
  communities: [
    { id: 'c1', name: 'TypeScript', slug: 'typescript', bookmarked: false },
    { id: 'c2', name: 'JavaScript', slug: 'javascript', bookmarked: true },
  ],
}

describe('fetchCombinedSearch', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue(baseResponse)
  })

  it('calls GET /api/v1/search with query param', async () => {
    const signal = new AbortController().signal
    const result = await fetchCombinedSearch('typescript', signal)
    expect(mockGet).toHaveBeenCalledWith('/api/v1/search', {
      searchParams: { q: 'typescript' },
      signal,
    })
    expect(result.topics).toEqual(baseResponse.topics)
    expect(result.posts).toEqual(baseResponse.posts)
    expect(result.domains).toEqual(baseResponse.domains)
    expect(result.news[0]).toMatchObject({
      id: 'n1',
      url: { url: 'https://example.com/news' },
      data: { title: 'Breaking News' },
      rss_feed: { title: 'Tech Feed' },
    })
    const communityIds = result.communities.map((c: { id: string }) => c.id)
    expect(communityIds).toEqual(['c2', 'c1'])
  })
})
