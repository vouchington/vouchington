import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCrawlers, getCrawler } from './admin'
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

vi.mock(import('./urls'), () => ({
  getUrl: vi.fn<VitestLooseMock>(),
}))

describe('admin server api helpers', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue(null)
  })

  describe('getCrawlers', () => {
    it('calls serverApi.get with the crawlers endpoint and no options', async () => {
      mockGet.mockResolvedValue({
        results: [],
        page_info: { has_next_page: false, end_cursor: null },
      })
      await getCrawlers()

      expect(mockGet).toHaveBeenCalledWith('/api/v1/crawlers', {
        headers: undefined,
        searchParams: { limit: undefined, after: undefined },
      })
    })

    it('calls serverApi.get with limit and after when provided', async () => {
      mockGet.mockResolvedValue({
        results: [],
        page_info: { has_next_page: false, end_cursor: null },
      })
      await getCrawlers({ limit: 10, after: 'cursor-1' })

      expect(mockGet).toHaveBeenCalledWith('/api/v1/crawlers', {
        headers: undefined,
        searchParams: { limit: 10, after: 'cursor-1' },
      })
    })
  })

  describe('getCrawler', () => {
    it('calls serverApi.get with the crawler id', async () => {
      await getCrawler('crawler-1')

      expect(mockGet).toHaveBeenCalledWith('/api/v1/crawlers/crawler-1', undefined)
    })

    it('returns null when the crawler is not found', async () => {
      mockGet.mockRejectedValue(new ApiError('Not found', 404))

      const result = await getCrawler('missing')

      expect(result).toBeNull()
    })
  })
})
