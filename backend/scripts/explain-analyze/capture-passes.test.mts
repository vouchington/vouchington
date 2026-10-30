import { describe, expect, it } from 'vitest'
import type { ExplainResult } from '@data-stores/psql'
import { captureScenarioTwice } from './capture-passes.mts'
import { registerScenarioContract } from './plan-expectations.mts'
import { baselinedRelationsAbsentFromPlan } from './seq-scan-baseline.mts'
import {
  baselinedIndexProbeOptions,
  recordForcedBaselineScans,
  type ProbedExplainResult,
} from './seq-scan-ties.mts'

function captureInput(scenarioId: string) {
  return {
    name: 'serial-function-count-test',
    text: `/* serialFunctionCountTest */
    SELECT fn_text_to_timestamptz('2026-01-0' || value::text || 'T00:00:00Z')
    FROM generate_series(1, 3) AS value
    WHERE current_setting('max_parallel_workers_per_gather') = '0' OR value = 1`,
    values: [],
    scenarioId,
    captureIndex: 0,
    planCacheMode: 'auto' as const,
    localSettings: { max_parallel_workers_per_gather: '2' },
  }
}

describe('EXPLAIN function-call capture', () => {
  it('counts a capped scenario in a serial replay while retaining the original plan', async () => {
    const scenarioId = 'post-search-new'
    registerScenarioContract(scenarioId, {
      expectations: [{ kind: 'maxFunctionCalls', function: 'fn_text_to_timestamptz', max: 3 }],
    })
    const input = captureInput(scenarioId)
    const first = [] as Awaited<ReturnType<typeof captureScenarioTwice>>[number][]
    const second = await captureScenarioTwice([input], result => first.push(result))

    for (const result of [...first, ...second]) {
      expect(result.function_calls_serial).toBe(true)
      expect(result.function_calls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ funcname: 'fn_text_to_timestamptz', calls: 3 }),
        ]),
      )
      expect((result.plan as { Plan: { 'Actual Rows': number } }).Plan['Actual Rows']).toBe(1)
    }
  })

  it('keeps uncapped function counts and plan on the caller settings', async () => {
    const scenarioId = 'post-metrics-batch'
    registerScenarioContract(scenarioId, { expectations: [] })
    const input = captureInput(scenarioId)
    const first = [] as Awaited<ReturnType<typeof captureScenarioTwice>>[number][]
    const second = await captureScenarioTwice([input], result => first.push(result))

    for (const result of [...first, ...second]) {
      expect(result.function_calls_serial).toBeUndefined()
      expect(result.function_calls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ funcname: 'fn_text_to_timestamptz', calls: 1 }),
        ]),
      )
      expect((result.plan as { Plan: { 'Actual Rows': number } }).Plan['Actual Rows']).toBe(1)
    }
  })
})

const limitPlan = (nodeType: string) => ({
  Plan: {
    'Node Type': 'Limit',
    'Total Cost': 150,
    Plans: [{ 'Node Type': nodeType, 'Relation Name': 'posts__default', 'Total Cost': 120 }],
  },
})

function baselinedResult(overrides: Partial<ExplainResult> = {}): ProbedExplainResult {
  return {
    name: 'buildPostSearchQuery:force_generic_plan',
    scenario_id: 'post-search-hot',
    capture_index: 0,
    plan_cache_mode: 'force_generic_plan',
    query_text: 'SELECT 1',
    plan: {},
    execution_time_ms: 1,
    planning_time_ms: 1,
    timestamp: '2026-10-17T00:00:00.000Z',
    ...overrides,
  }
}

describe('baselined scan probe', () => {
  it('plans a skipped baselined scan with every index path disabled', () => {
    const captured = baselinedResult()
    expect(baselinedRelationsAbsentFromPlan(captured, [])).toEqual(['posts'])
    expect(
      baselinedIndexProbeOptions({ localSettings: { work_mem: '8MB' }, planCacheMode: 'auto' }),
    ).toEqual({
      localSettings: {
        work_mem: '8MB',
        enable_indexscan: 'off',
        enable_bitmapscan: 'off',
        enable_indexonlyscan: 'off',
      },
      planCacheMode: 'auto',
      planOnly: true,
    })
    recordForcedBaselineScans(captured, ['posts'], limitPlan('Seq Scan'))
    expect(captured.forced_seq_scans).toEqual({ posts: { total_cost: 150, scan_cost: 120 } })
  })

  it('records nothing when the forced plan does not reproduce the scan', () => {
    const captured = baselinedResult()
    recordForcedBaselineScans(captured, ['posts'], limitPlan('Index Scan'))
    expect(captured.forced_seq_scans).toBeUndefined()
  })

  it('does not plan when the scan was observed or is not baselined', () => {
    expect(baselinedRelationsAbsentFromPlan(baselinedResult(), ['posts'])).toEqual([])
    expect(
      baselinedRelationsAbsentFromPlan(baselinedResult({ scenario_id: 'not-baselined' }), []),
    ).toEqual([])
  })
})
