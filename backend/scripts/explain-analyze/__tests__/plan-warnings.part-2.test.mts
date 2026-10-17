import { describe, expect, it } from 'vitest'
import { functionCallReports, getResourcePressureFingerprints } from '../plan-warnings.mts'
import type { ExplainResult } from '@data-stores/psql'

function makeResult(plan: unknown, opts?: Partial<ExplainResult>): ExplainResult {
  return {
    name: 'test',
    query_text: 'SELECT 1',
    plan,
    execution_time_ms: opts?.execution_time_ms ?? 1,
    planning_time_ms: opts?.planning_time_ms ?? 0,
    timestamp: new Date().toISOString(),
    ...opts,
  }
}

describe('getResourcePressureFingerprints', () => {
  it('reports a query-level aggregate fingerprint when WAL is split across siblings below the per-node threshold', () => {
    // Each modifying child stays under HIGH_WAL_BYTES_THRESHOLD on its own, but their shared
    // ancestor's cumulative total (as Postgres reports it) crosses it.
    const plan = {
      Plan: {
        'Node Type': 'ModifyTable',
        'WAL Bytes': 12 * 1024 * 1024,
        Plans: [
          { 'Node Type': 'Insert', 'WAL Bytes': 6 * 1024 * 1024 },
          { 'Node Type': 'Insert', 'WAL Bytes': 6 * 1024 * 1024 },
        ],
      },
    }

    expect(getResourcePressureFingerprints(makeResult(plan))).toEqual(['query:wal-aggregate'])
  })

  it('does not duplicate the aggregate fingerprint when a single node already accounts for the WAL', () => {
    const plan = {
      Plan: {
        'Node Type': 'Sort',
        'WAL Bytes': 11 * 1024 * 1024,
      },
    }

    expect(getResourcePressureFingerprints(makeResult(plan))).toEqual(['Sort:-:wal'])
  })

  it('does not report the aggregate fingerprint when total WAL stays under the threshold', () => {
    const plan = {
      Plan: {
        'Node Type': 'ModifyTable',
        'WAL Bytes': 4 * 1024 * 1024,
        Plans: [
          { 'Node Type': 'Insert', 'WAL Bytes': 2 * 1024 * 1024 },
          { 'Node Type': 'Insert', 'WAL Bytes': 2 * 1024 * 1024 },
        ],
      },
    }

    expect(getResourcePressureFingerprints(makeResult(plan))).toEqual([])
  })
})

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
