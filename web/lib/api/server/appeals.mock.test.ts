import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getModerationAppeals, getModerationAppealById } from './appeals'

const { mockGet, mockReturnNullForMissingEntity } = vi.hoisted(() => ({
  mockGet: vi.fn<VitestLooseMock>(),
  mockReturnNullForMissingEntity: vi.fn<VitestLooseMock>(
    async (promise: Promise<unknown>) => promise,
  ),
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

vi.mock(import('../return-null-for-missing-entity'), () => ({
  returnNullForMissingEntity: mockReturnNullForMissingEntity,
}))

describe('appeals server api helpers', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockReturnNullForMissingEntity.mockClear()
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

  describe('getModerationAppealById', () => {
    it('returns appeal when present', async () => {
      const appeal = {
        id: 'appeal-1',
        status: 'pending',
        appellant_id: 'user-1',
        appeal_reason: 'unfair ban',
      }
      mockGet.mockResolvedValueOnce({ appeal })
      const result = await getModerationAppealById('appeal-1')
      expect(result).toEqual(appeal)
      expect(mockGet).toHaveBeenCalledWith('/api/v1/appeals/appeal-1')
      expect(mockReturnNullForMissingEntity).toHaveBeenCalledTimes(1)
    })

    it('returns null when the entity is missing via returnNullForMissingEntity', async () => {
      mockReturnNullForMissingEntity.mockResolvedValueOnce(null)
      const result = await getModerationAppealById('nonexistent')
      expect(result).toBeNull()
    })
  })
})
