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
import { getList, getListItems, getMyLists } from '../lists'

describe('lists server api helpers', () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  describe('getList', () => {
    it('fetches the correct endpoint', async () => {
      mockGet.mockResolvedValue({ list: { id: 'list-1', name: 'My List' } })

      const result = await getList('list-1')

      expect(mockGet).toHaveBeenCalledWith('/api/v1/lists/list-1', undefined)
      expect(result).toEqual({ list: { id: 'list-1', name: 'My List' } })
    })

    it('returns null for 404', async () => {
      mockGet.mockRejectedValue(new ApiError('Not Found', 404))

      const result = await getList('missing-id')

      expect(result).toBeNull()
    })

    it('passes headers when provided', async () => {
      mockGet.mockResolvedValue({ list: { id: 'list-1' } })

      await getList('list-1', { headers: { cookie: 'session=abc' } })

      expect(mockGet).toHaveBeenCalledWith('/api/v1/lists/list-1', {
        headers: { cookie: 'session=abc' },
      })
    })
  })

  describe('getListItems', () => {
    it('fetches the correct endpoint', async () => {
      mockGet.mockResolvedValue({ results: [], list_items: {}, page_info: {} })

      await getListItems('list-1')

      expect(mockGet).toHaveBeenCalledWith('/api/v1/lists/list-1/items', {})
    })

    it('forwards search params', async () => {
      mockGet.mockResolvedValue({ results: [], list_items: {}, page_info: {} })

      await getListItems('list-1', { searchParams: { limit: 10 } })

      expect(mockGet).toHaveBeenCalledWith('/api/v1/lists/list-1/items', {
        searchParams: { limit: 10 },
      })
    })
  })

  describe('getMyLists', () => {
    it('fetches the correct endpoint', async () => {
      mockGet.mockResolvedValue({ results: [], lists: {}, page_info: {} })

      await getMyLists()

      expect(mockGet).toHaveBeenCalledWith('/api/v1/lists', {})
    })

    it('forwards search params', async () => {
      mockGet.mockResolvedValue({ results: [], lists: {}, page_info: {} })

      await getMyLists({ searchParams: { limit: 5 } })

      expect(mockGet).toHaveBeenCalledWith('/api/v1/lists', { searchParams: { limit: 5 } })
    })
  })
})
