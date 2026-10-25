import { describe, expect, it } from 'vitest'
import { createRequestQueryProfile } from '../../test-helpers/query-profiles.mts'
import { recordQueryTiming } from './query-timing.mts'

describe('request query profile attribution', () => {
  const timing = { pool: 'read', durationMs: 0, rowCount: 0, error: false } as const

  it('attributes timing-hook queries to the active scope only', async () => {
    const first = createRequestQueryProfile()
    const second = createRequestQueryProfile()
    recordQueryTiming({ ...timing, annotation: 'outside' })
    await Promise.all([
      first.run(async () => {
        await Promise.resolve()
        recordQueryTiming({ ...timing, annotation: 'one' })
        recordQueryTiming({ ...timing, annotation: 'one', cursorBatches: 3 })
      }),
      second.run(async () => {
        await Promise.resolve()
        recordQueryTiming({ ...timing, annotation: 'two' })
      }),
    ])
    expect(first.summarize().totalQueries).toBe(2)
    expect(first.summarize().repeats).toEqual([])
    expect(second.summarize().totalQueries).toBe(1)
  })
})
