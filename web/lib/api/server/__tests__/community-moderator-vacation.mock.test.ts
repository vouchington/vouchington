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

vi.mock(import('@/lib/api/return-null-for-missing-entity'), () => ({
  returnNullForMissingEntity: vi.fn<VitestLooseMock>(async (promise: Promise<unknown>) => promise),
}))

import { getMyModeratorVacation } from '../community-moderator-vacation'
import { returnNullForMissingEntity } from '@/lib/api/return-null-for-missing-entity'

const mockReturnNullForMissingEntity = vi.mocked(returnNullForMissingEntity)

describe('community-moderator-vacation server api helpers', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockReturnNullForMissingEntity.mockReset()
    mockReturnNullForMissingEntity.mockImplementation(async (promise: Promise<unknown>) => promise)
  })

  describe('getMyModeratorVacation', () => {
    it('calls the correct endpoint and returns the response', async () => {
      const vacation = { ends_at: null, starts_at: '2026-06-09T00:00:00.000Z' }
      const response = { moderator_vacation: vacation }
      mockGet.mockResolvedValueOnce(response)

      const result = await getMyModeratorVacation('test-slug')

      expect(mockGet).toHaveBeenCalledWith('/api/v1/communities/test-slug/moderator-vacation')
      expect(result).toEqual(response)
      expect(mockReturnNullForMissingEntity).toHaveBeenCalledWith(expect.any(Promise), {
        nullStatusCodes: [403, 404],
      })
    })

    it('returns null when the entity is missing (via returnNullForMissingEntity)', async () => {
      mockReturnNullForMissingEntity.mockResolvedValueOnce(null)
      mockGet.mockResolvedValueOnce({ moderator_vacation: null })

      const result = await getMyModeratorVacation('missing-slug')

      expect(result).toBeNull()
    })
  })
})
