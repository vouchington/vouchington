import { describe, expect, it } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { copyrightSweepConfig } from '@services/copyright-notices/work-limits'
import { walkCopyrightSweep } from './copyright-sweep-walk.mts'

describe('copyright sweep budget', () => {
  it('stops at the page cap and resumes its saved cursor while retaining item errors', async () => {
    overrideDynamicConfigFieldsForTest(copyrightSweepConfig, {
      batch_size: 1,
      max_batches_per_run: 1,
    })
    const requests: Array<{ after?: string; limit?: number }> = []
    const settled: string[] = []
    let after: string | undefined
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
      return ids.includes('head') ? [failure] : []
    }
    await expect(
      walkCopyrightSweep(search, settle, {
        onMore: cursor => {
          after = cursor
        },
      }),
    ).resolves.toEqual([failure])
    expect(after).toBe('head-cursor')
    await expect(walkCopyrightSweep(search, settle, { after })).resolves.toEqual([])
    expect(requests).toEqual([{ limit: 1 }, { after: 'head-cursor', limit: 1 }])
    expect(settled).toEqual(['head', 'tail'])
  })
})
