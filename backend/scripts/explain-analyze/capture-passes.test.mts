import { afterEach, describe, expect, it } from 'vitest'
import { SEQ_SCAN_BASELINE } from './seq-scan-baseline.mts'
import { captureScenarioTwice, resetRepeatedResults } from './capture-passes.mts'
import type { ProbedExplainResult } from './seq-scan-ties.mts'
import { registerScenarioContract, resetScenarioContracts } from './plan-expectations.mts'

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

  it('prices a baselined scan the planner skipped with index scans disabled', async () => {
    const lookup = {
      name: 'baselined-index-lookup',
      text: '/* baselinedIndexLookup */ SELECT s FROM generate_series(1, 3) AS s WHERE NOT EXISTS (SELECT 1 FROM posts WHERE id = $1::uuid)',
      values: ['00000000-0000-7000-8000-000000000000'],
      scenarioId,
      captureIndex: 0,
      planCacheMode: 'auto' as const,
      // An empty table plans a sequential scan; disabling it stands in for the planner's flip.
      localSettings: { enable_seqscan: 'off' },
    }
    const identity = `${scenarioId}|0|${lookup.name}|auto`
    const baseline = SEQ_SCAN_BASELINE as Record<string, readonly string[]>
    registerScenarioContract(scenarioId, { expectations: [] })
    baseline[identity] = ['posts']
    try {
      const first = [] as Awaited<ReturnType<typeof captureScenarioTwice>>[number][]
      await captureScenarioTwice([lookup], result => first.push(result))
      const forced = (first[0] as ProbedExplainResult).forced_seq_scans?.['posts']
      expect(forced).toBeDefined()
      expect(forced?.total_cost).toBeGreaterThanOrEqual(forced?.scan_cost ?? 0)
    } finally {
      delete baseline[identity]
    }
  })
})
