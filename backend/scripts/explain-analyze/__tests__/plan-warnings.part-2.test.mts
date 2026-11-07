import { describe, expect, it } from 'vitest'
import {
  analyzeResult,
  functionCallReports,
  getResourcePressureFingerprints,
} from '../plan-warnings.mts'
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
  it('uses the scenario WAL limit for node and aggregate pressure after JSON serialization', () => {
    const limit = 10 * 1024 * 1024
    const scenarioId = 'post-url-capacity-maximum-overcap'
    const single = (bytes: number) =>
      makeResult(
        { Plan: { 'Node Type': 'ModifyTable', 'WAL Bytes': bytes } },
        { scenario_id: scenarioId },
      )
    const roundTripped = JSON.parse(JSON.stringify(single(limit - 1))) as ExplainResult
    expect(getResourcePressureFingerprints(roundTripped)).toEqual([])
    expect(analyzeResult(roundTripped).resourcePressure).toEqual([])
    expect(getResourcePressureFingerprints(single(limit))).toEqual(['ModifyTable:-:wal'])
    expect(analyzeResult(single(limit)).resourcePressure).toHaveLength(1)

    const aggregate = (bytes: number) =>
      makeResult(
        {
          Plan: {
            'Node Type': 'ModifyTable',
            'WAL Bytes': bytes,
            Plans: [
              { 'Node Type': 'Insert', 'WAL Bytes': Math.floor(bytes / 2) },
              { 'Node Type': 'Insert', 'WAL Bytes': Math.ceil(bytes / 2) },
            ],
          },
        },
        { scenario_id: scenarioId },
      )
    expect(getResourcePressureFingerprints(aggregate(limit - 1))).toEqual([])
    expect(getResourcePressureFingerprints(aggregate(limit))).toEqual(['query:wal-aggregate'])
  })

  it('retains the default WAL limit for missing or different scenario identities', () => {
    const plan = { Plan: { 'Node Type': 'ModifyTable', 'WAL Bytes': 11 * 1024 * 1024 } }
    for (const scenario_id of [undefined, 'post-url-capacity-default-boundary']) {
      const result = makeResult(plan, { scenario_id })
      expect(getResourcePressureFingerprints(result)).toEqual(['ModifyTable:-:wal'])
      expect(analyzeResult(result).resourcePressure).toHaveLength(1)
    }
  })

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
