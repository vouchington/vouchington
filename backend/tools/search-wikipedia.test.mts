import undici from 'undici'
import { it, expect, describe, afterEach, vi } from 'vitest'
import searchWikipediaTool from './search-wikipedia.mts'
import type { PrivateUser } from '@services/users/types'

describe('search-wikipedia', () => {
  const mockUser: PrivateUser = {
    id: 'test-user-id',
    username: 'testuser',
  } as PrivateUser

  it('defines its query and limit parameters', () => {
    const params = (
      searchWikipediaTool.schema.parameters as { properties?: Record<string, unknown> }
    )?.properties
    expect({
      name: searchWikipediaTool.schema.name,
      type: searchWikipediaTool.schema.type,
      required: (searchWikipediaTool.schema.parameters as { required?: string[] })?.required,
      query: params?.query,
      limit: params?.limit,
    }).toMatchObject({
      name: 'search_wikipedia',
      type: 'function',
      required: ['query'],
      query: { type: 'string' },
      limit: { type: 'number' },
    })
  })

  describe('error handling', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('returns { success: false, error } when searchWikipediaByTitle throws', async () => {
      // 403 is not retried, so one mock is enough to produce a throw from searchWikipediaByTitle
      vi.spyOn(undici, 'fetch').mockResolvedValueOnce(new undici.Response(null, { status: 403 }))

      const execute = searchWikipediaTool.function(mockUser)
      const result = await execute({ query: 'TypeScript' })

      expect(result).toEqual({ success: false, error: 'Wikipedia search failed: 403' })
    })
  })
})
