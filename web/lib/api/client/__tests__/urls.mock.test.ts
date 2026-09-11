import { describe, it, expect, vi, afterEach } from 'vitest'
import type { UrlListResponseBody } from '@/types/api-responses'

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
import { fetchUrls } from '../urls'

const mockGet = vi.mocked(clientApi.get)

const emptyResponse: UrlListResponseBody = {
  results: [],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
}

describe('urls', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('fetchUrls', () => {
    it('calls the API when query is undefined', async () => {
      mockGet.mockResolvedValueOnce(emptyResponse)
      await fetchUrls()
      expect(mockGet).toHaveBeenCalledWith('/api/v1/urls', {
        searchParams: {
          query: undefined,
          limit: undefined,
        },
        signal: undefined,
      })
    })

    it('calls the API and omits the query parameter when query is an empty string', async () => {
      mockGet.mockResolvedValueOnce(emptyResponse)
      await fetchUrls({ query: '' })
      expect(mockGet).toHaveBeenCalledWith('/api/v1/urls', {
        searchParams: {
          query: undefined,
          limit: undefined,
        },
        signal: undefined,
      })
    })

    it('omits the query parameter when whitespace trims to empty', async () => {
      mockGet.mockResolvedValueOnce(emptyResponse)
      await fetchUrls({ query: '   ' })
      expect(mockGet).toHaveBeenCalledWith('/api/v1/urls', {
        searchParams: {
          query: undefined,
          limit: undefined,
        },
        signal: undefined,
      })
    })

    it('does NOT call the API for a 1-character query', async () => {
      const result = await fetchUrls({ query: 'h' })
      expect(mockGet).not.toHaveBeenCalled()
      expect(result.results).toHaveLength(0)
    })

    it('does NOT call the API for a 2-character query', async () => {
      const result = await fetchUrls({ query: 'ht' })
      expect(mockGet).not.toHaveBeenCalled()
      expect(result.results).toHaveLength(0)
    })

    it('calls the API for a query at the minimum length', async () => {
      mockGet.mockResolvedValueOnce(emptyResponse)
      await fetchUrls({ query: 'htt' })
      expect(mockGet).toHaveBeenCalledOnce()
    })

    it('trims query whitespace before calling the API', async () => {
      mockGet.mockResolvedValueOnce(emptyResponse)
      await fetchUrls({ query: '  https://example.com  ', limit: 10 })
      expect(mockGet).toHaveBeenCalledWith('/api/v1/urls', {
        searchParams: {
          query: 'https://example.com',
          limit: 10,
        },
        signal: undefined,
      })
    })

    it('does NOT call the API when padded whitespace trims below minimum', async () => {
      const result = await fetchUrls({ query: '  ab  ' })
      expect(mockGet).not.toHaveBeenCalled()
      expect(result.results).toHaveLength(0)
    })
  })
})
