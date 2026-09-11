import { describe, it, expect, vi, afterEach } from 'vitest'
import type { ListResponse } from '@/types/api-responses'
import type { RssFeedCrawlSummary } from '@/types/rss-feeds'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        get: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('../instance'),
)

import { clientApi } from '../instance'
import { getRssFeedCrawls } from '../rss-feeds'

const mockGet = vi.mocked(clientApi.get)

describe('rss-feeds client helpers', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('getRssFeedCrawls GETs the crawls list and returns the response', async () => {
    const response: ListResponse<RssFeedCrawlSummary> = {
      results: [{ id: 'crawl-1', response_code: 200, created_at: '2026-01-02T00:00:00Z' }],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    }
    mockGet.mockResolvedValueOnce(response)
    const result = await getRssFeedCrawls('rss-feed-1')
    expect(mockGet).toHaveBeenCalledWith('/api/v1/rss-feeds/rss-feed-1/crawls')
    expect(result).toEqual(response)
  })
})
