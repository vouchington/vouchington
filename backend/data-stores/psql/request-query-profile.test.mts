import { describe, expect, it } from 'vitest'
import {
  computeSerialDepth,
  findRepeatedAnnotations,
  formatRequestProfileLine,
  summarizeRequestQueries,
  type RequestQuery,
} from './request-query-profile-summary.mts'
import { createRequestQueryProfile } from './request-query-profile.mts'
import { recordQueryTiming } from './query-telemetry.mts'

function query(annotation: string | null, startMs: number, endMs: number, excluded = false) {
  return { annotation, startMs, endMs, excludedFromRepeats: excluded } satisfies RequestQuery
}

describe('request query profile math', () => {
  it('counts sequential queries as depth and overlapping ones once', () => {
    expect(computeSerialDepth([query('a', 0, 5), query('b', 5, 10), query('c', 10, 12)])).toBe(3)
    expect(computeSerialDepth([query('a', 0, 10), query('b', 1, 9), query('c', 2, 8)])).toBe(1)
    expect(computeSerialDepth([query('a', 0, 5), query('b', 4, 9), query('c', 8, 12)])).toBe(2)
    expect(computeSerialDepth([])).toBe(0)
  })

  it('reports repeated annotations and skips cursor and pipelined batches', () => {
    const queries = [
      query('loadPost', 0, 1),
      query('loadPost', 1, 2),
      query('loadPost', 2, 3),
      query('list', 3, 4),
      query('batched', 4, 5, true),
      query('batched', 5, 6, true),
      query(null, 6, 7),
      query(null, 7, 8),
    ]
    expect(findRepeatedAnnotations(queries)).toEqual([
      { annotation: 'loadPost', count: 3 },
      { annotation: 'unannotated', count: 2 },
    ])
    expect(summarizeRequestQueries(queries).totalQueries).toBe(8)
  })

  it('stays quiet without repeats unless all profiles are requested', () => {
    const summary = summarizeRequestQueries([query('a', 0, 1), query('b', 1, 2)])
    expect(formatRequestProfileLine('GET /x', summary, { all: false })).toBeNull()
    expect(formatRequestProfileLine('GET /x', summary, { all: true })).toBe(
      '[pg-request-profile] route=GET /x queries=2 serialDepth=2 repeats=none\n',
    )
    const repeated = summarizeRequestQueries([query('a', 0, 1), query('a', 1, 2)])
    expect(formatRequestProfileLine('GET /x', repeated, { all: false })).toBe(
      '[pg-request-profile] route=GET /x queries=2 serialDepth=2 repeats=a(x2)\n',
    )
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
