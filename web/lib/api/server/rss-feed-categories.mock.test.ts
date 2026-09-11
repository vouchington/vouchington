import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAdminRssFeedCategories } from './rss-feed-categories'

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

describe('rss-feed-categories server api helpers', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue({
      results: [],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    })
  })

  it('getAdminRssFeedCategories calls the rss-feed-categories endpoint', async () => {
    await getAdminRssFeedCategories()
    expect(mockGet).toHaveBeenCalledWith('/api/v1/rss-feed-categories', {})
  })

  it('getAdminRssFeedCategories forwards searchParams', async () => {
    await getAdminRssFeedCategories({ searchParams: { status: 'rejected', limit: 10 } })
    expect(mockGet).toHaveBeenCalledWith('/api/v1/rss-feed-categories', {
      searchParams: { status: 'rejected', limit: 10 },
    })
  })
})
