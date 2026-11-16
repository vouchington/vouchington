import { describe, expect, it } from 'vitest'
import { walkCopyrightSweep } from './copyright-sweep-walk.mts'

describe('copyright sweep walk', () => {
  it('stops at the page cap and resumes its saved cursor while retaining item errors', async () => {
    const limits = { batchSize: 1, maxBatches: 1 }
    const requests: Array<{ after?: string; limit?: number }> = []
    const settled: string[] = []
    const search = async (request: { after?: string; limit?: number }) => {
      requests.push(request)
      return {
        results: [request.after ? 'tail' : 'head'],
        page_info: {
          start_cursor: null,
          end_cursor: request.after ? null : 'head-cursor',
          has_next_page: !request.after,
        },
      }
    }
    const failure = new Error('head needs retry')
    const settle = async (ids: readonly string[]) => {
      settled.push(...ids)
      return { errors: ids.includes('head') ? [failure] : [], enqueued: 0 }
    }
    const first = await walkCopyrightSweep(search, settle, { limits })
    expect(first).toEqual({ errors: [failure], enqueued: 0, after: 'head-cursor' })
    await expect(
      walkCopyrightSweep(search, settle, { limits, after: first.after }),
    ).resolves.toEqual({ errors: [], enqueued: 0 })
    expect(requests).toEqual([{ limit: 1 }, { after: 'head-cursor', limit: 1 }])
    expect(settled).toEqual(['head', 'tail'])
  })
})
