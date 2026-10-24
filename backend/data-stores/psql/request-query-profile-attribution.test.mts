import { describe, expect, it } from 'vitest'
import {
  createRequestQueryProfile,
  type RequestQuerySummary,
} from '../../test-helpers/query-profiles.mts'
import { formatRequestProfileLine } from '../../test-helpers/request-query-profile-line.mts'
import { recordQueryTiming } from './query-timing.mts'

const summary = (repeats: RequestQuerySummary['repeats']): RequestQuerySummary => ({
  totalQueries: 2,
  serialDepth: 2,
  repeats,
})

describe('request profile line', () => {
  it('stays quiet without repeats unless all profiles are requested', () => {
    expect(formatRequestProfileLine('GET /x', summary([]), { all: false })).toBeNull()
    expect(formatRequestProfileLine('GET /x', summary([]), { all: true })).toBe(
      '[pg-request-profile] route=GET /x queries=2 serialDepth=2 repeats=none\n',
    )
    expect(
      formatRequestProfileLine('GET /x', summary([{ annotation: 'a', count: 2 }]), { all: false }),
    ).toBe('[pg-request-profile] route=GET /x queries=2 serialDepth=2 repeats=a(x2)\n')
  })
})

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
