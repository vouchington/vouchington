import { describe, expect, it } from 'vitest'
import type { ExplainResult } from '@data-stores/psql'
import { functionCallReports } from './plan-warnings.mts'

function makeResult(plan: unknown, opts?: Partial<ExplainResult>): ExplainResult {
  return {
    name: 'test',
    query_text: 'SELECT 1',
    plan,
    execution_time_ms: 1,
    planning_time_ms: 0,
    timestamp: '2026-01-01T00:00:00.000Z',
    ...opts,
  }
}

describe('functionCallReports', () => {
  it('marks leader-only parallel counts incomplete and reports serial replay counts', () => {
    const parallel = makeResult({ Plan: { 'Node Type': 'Gather', 'Workers Launched': 1 } })
    expect(functionCallReports([parallel])).toEqual([{ result: parallel, busiest: null }])

    parallel.function_calls_serial = true
    parallel.function_calls = [{ funcname: 'fn_serial', calls: 50, total_time: 1, self_time: 1 }]
    expect(functionCallReports([parallel])).toEqual([
      { result: parallel, busiest: parallel.function_calls[0] },
    ])
  })

  it('reports only queries whose busiest function reaches 50 calls', () => {
    const below = makeResult(null, {
      name: 'below',
      function_calls: [{ funcname: 'fn_below', calls: 49, total_time: 1, self_time: 1 }],
    })
    const atLimit = makeResult(null, {
      name: 'at-limit',
      function_calls: [
        { funcname: 'fn_small', calls: 2, total_time: 1, self_time: 1 },
        { funcname: 'fn_busy', calls: 50, total_time: 2, self_time: 2 },
      ],
    })
    expect(functionCallReports([below, atLimit])).toEqual([
      { result: atLimit, busiest: atLimit.function_calls?.[1] },
    ])
  })
})
