import { afterEach, describe, expect, it, vi } from 'vitest'
import type { explainAnalyze } from '@data-stores/psql'
import {
  captureScenarioTwice,
  probeBaselinedScans,
  resetRepeatedResults,
} from './capture-passes.mts'
import { registerScenarioContract, resetScenarioContracts } from './plan-expectations.mts'
import type { ProbedExplainResult } from './seq-scan-ties.mts'

const scenarioId = 'post-search-new'
const input = {
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

describe('EXPLAIN function-call capture', () => {
  afterEach(() => {
    resetScenarioContracts()
    resetRepeatedResults()
  })

  it('counts a capped scenario in a serial replay while retaining the original plan', async () => {
    registerScenarioContract(scenarioId, {
      expectations: [{ kind: 'maxFunctionCalls', function: 'fn_text_to_timestamptz', max: 3 }],
    })
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
    registerScenarioContract(scenarioId, { expectations: [] })
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

describe('baselined scan probe', () => {
  const probeInput = {
    ...input,
    name: 'baselined-index-lookup',
    localSettings: { work_mem: '8MB' },
  }
  const baseline = { 'post-search-new|0|baselined-index-lookup|auto': ['posts'] }

  function result(): ProbedExplainResult {
    return {
      name: probeInput.name,
      scenario_id: scenarioId,
      capture_index: 0,
      plan_cache_mode: 'auto',
      query_text: probeInput.text,
      plan: {},
      execution_time_ms: 1,
      planning_time_ms: 1,
      timestamp: '2026-10-17T00:00:00.000Z',
    }
  }

  function planWith(nodeType: string) {
    return vi.fn<typeof explainAnalyze>().mockResolvedValue({
      ...result(),
      plan: {
        Plan: {
          'Node Type': 'Limit',
          'Total Cost': 150,
          Plans: [{ 'Node Type': nodeType, 'Relation Name': 'posts__default', 'Total Cost': 120 }],
        },
      },
    })
  }

  it('plans a skipped baselined scan with every index path disabled', async () => {
    const plan = planWith('Seq Scan')
    const captured = result()
    await probeBaselinedScans(probeInput, captured, [], plan, baseline)
    expect(captured.forced_seq_scans).toEqual({ posts: { total_cost: 150, scan_cost: 120 } })
    expect(plan).toHaveBeenCalledWith(probeInput.name, probeInput.text, probeInput.values, {
      localSettings: {
        work_mem: '8MB',
        enable_indexscan: 'off',
        enable_bitmapscan: 'off',
        enable_indexonlyscan: 'off',
      },
      planCacheMode: 'auto',
      planOnly: true,
    })
  })

  it('records nothing when the forced plan does not reproduce the scan', async () => {
    const captured = result()
    await probeBaselinedScans(probeInput, captured, [], planWith('Index Scan'), baseline)
    expect(captured.forced_seq_scans).toBeUndefined()
  })

  it('does not plan when the scan was observed or is not baselined', async () => {
    const plan = planWith('Seq Scan')
    await probeBaselinedScans(probeInput, result(), ['posts'], plan, baseline)
    await probeBaselinedScans(probeInput, result(), [], plan, {})
    expect(plan).not.toHaveBeenCalled()
  })
})
