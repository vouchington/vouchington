import { describe, expect, it } from 'vitest'
import { stubExplainPlans } from '@voucha/test-helpers/data-stores/psql/explain-plan-stub'
import { captureScenarioTwice } from './capture-passes.mts'
import { registerScenarioContract } from './plan-expectations.mts'
import type { ProbedExplainResult } from './seq-scan-ties.mts'

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

const resultPlan = {
  Plan: { 'Node Type': 'Result', 'Actual Rows': 1, 'Actual Loops': 1 },
}

function limitPlan(nodeType: string) {
  return {
    Plan: {
      'Node Type': 'Limit',
      'Total Cost': 150,
      'Actual Rows': 1,
      'Actual Loops': 1,
      Plans: [
        {
          'Node Type': nodeType,
          'Relation Name': 'posts__default',
          'Total Cost': 120,
          'Actual Rows': 5,
          'Actual Loops': 1,
        },
      ],
    },
  }
}

const indexOffOptions = {
  localSettings: {
    work_mem: '8MB',
    enable_indexscan: 'off',
    enable_bitmapscan: 'off',
    enable_indexonlyscan: 'off',
  },
  planCacheMode: 'force_generic_plan',
  planOnly: true,
}

function baselinedInput(scenarioId = 'post-search-hot') {
  return {
    name: 'buildPostSearchQuery:force_generic_plan',
    text: 'SELECT 1',
    values: [],
    scenarioId,
    captureIndex: 0,
    planCacheMode: 'force_generic_plan' as const,
    localSettings: { work_mem: '8MB' },
  }
}

describe('baselined scan probe', () => {
  it('plans a skipped baselined scan with every index path disabled', async () => {
    const stub = stubExplainPlans(call =>
      call.options.localSettings?.enable_indexscan === 'off' ? limitPlan('Seq Scan') : resultPlan,
    )
    try {
      const first: Awaited<ReturnType<typeof captureScenarioTwice>>[number][] = []
      await captureScenarioTwice([baselinedInput()], result => first.push(result))
      const indexOff = stub.calls.filter(
        call => call.options.localSettings?.enable_indexscan === 'off',
      )
      expect(indexOff.length).toBeGreaterThan(0)
      for (const call of indexOff) expect(call.options).toEqual(indexOffOptions)
      expect((first[0] as ProbedExplainResult | undefined)?.forced_seq_scans).toEqual({
        posts: { total_cost: 150, scan_cost: 120 },
      })
    } finally {
      stub.restore()
    }
  })

  it('records nothing when the forced plan does not reproduce the scan', async () => {
    const stub = stubExplainPlans(call =>
      call.options.localSettings?.enable_indexscan === 'off' ? limitPlan('Index Scan') : resultPlan,
    )
    try {
      const first: Awaited<ReturnType<typeof captureScenarioTwice>>[number][] = []
      await captureScenarioTwice([baselinedInput()], result => first.push(result))
      expect((first[0] as ProbedExplainResult | undefined)?.forced_seq_scans).toBeUndefined()
    } finally {
      stub.restore()
    }
  })

  it('does not plan when the scan was observed or is not baselined', async () => {
    const observed = stubExplainPlans(call =>
      call.options.localSettings?.enable_seqscan === 'off' ? resultPlan : limitPlan('Seq Scan'),
    )
    try {
      await captureScenarioTwice([baselinedInput()], () => undefined)
      expect(
        observed.calls.some(call => call.options.localSettings?.enable_indexscan === 'off'),
      ).toBe(false)
    } finally {
      observed.restore()
    }

    const unbaselined = stubExplainPlans(() => resultPlan)
    try {
      await captureScenarioTwice([baselinedInput('comment-ancestors')], () => undefined)
      expect(
        unbaselined.calls.some(call => call.options.localSettings?.enable_indexscan === 'off'),
      ).toBe(false)
    } finally {
      unbaselined.restore()
    }
  })
})
