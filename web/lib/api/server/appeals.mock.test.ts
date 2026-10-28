import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getModerationAppeals } from './appeals'

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

describe('appeals server api helpers', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue({
      appeals: [],
      page_info: { has_next_page: false, end_cursor: null },
    })
  })

  describe('getModerationAppeals', () => {
    it('calls /api/v1/appeals with default options', async () => {
      await getModerationAppeals()
      expect(mockGet).toHaveBeenCalledWith('/api/v1/appeals', {})
    })

    it('calls /api/v1/appeals with search params', async () => {
      const options = { searchParams: { limit: 50, cursor: 'abc', status: 'pending' } }
      await getModerationAppeals(options)
      expect(mockGet).toHaveBeenCalledWith('/api/v1/appeals', options)
    })

    it('returns appeals list response', async () => {
      const appeals = [{ id: 'appeal-1', status: 'pending' }]
      mockGet.mockResolvedValueOnce({
        appeals,
        page_info: { has_next_page: true, end_cursor: 'appeal-1' },
      })
      const result = await getModerationAppeals()
      expect(result.appeals).toEqual(appeals)
      expect(result.page_info.has_next_page).toBe(true)
    })
  })
})
