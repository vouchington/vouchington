import undici from 'undici'
import { it, expect, describe, afterEach, vi } from 'vitest'
import getWikipediaSummaryTool from './get-wikipedia-summary.mts'
import type { PrivateUser } from '@services/users/types'

describe('get-wikipedia-summary', () => {
  const mockUser: PrivateUser = {
    id: 'test-user-id',
    username: 'testuser',
  } as PrivateUser

  it('defines its required title parameter', () => {
    const params = (
      getWikipediaSummaryTool.schema.parameters as { properties?: Record<string, unknown> }
    )?.properties
    expect({
      name: getWikipediaSummaryTool.schema.name,
      type: getWikipediaSummaryTool.schema.type,
      required: (getWikipediaSummaryTool.schema.parameters as { required?: string[] })?.required,
      title: params?.title,
    }).toMatchObject({
      name: 'get_wikipedia_summary',
      type: 'function',
      required: ['title'],
      title: { type: 'string' },
    })
  })

  describe('error handling', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('returns { found: false, error } when getWikipediaSummary throws', async () => {
      // 403 is not retried, so one mock is enough to produce a throw from getWikipediaSummary
      vi.spyOn(undici, 'fetch').mockResolvedValueOnce(new undici.Response(null, { status: 403 }))

      const execute = getWikipediaSummaryTool.function(mockUser)
      const result = await execute({ title: 'TypeScript' })

      expect(result).toEqual({ found: false, error: 'Wikipedia summary failed: 403' })
    })
  })
})
