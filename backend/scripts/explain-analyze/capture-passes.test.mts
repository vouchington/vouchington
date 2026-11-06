import { describe, expect, it } from 'vitest'
import { createExplainWalCaptureFixture } from '@voucha/test-helpers/explain-wal-capture'
import { captureScenarioTwice } from './capture-passes.mts'
import { registerScenarioContract } from './plan-expectations.mts'

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

  it('captures cold WAL in both passes and plan modes while preserving rollback', async () => {
    const scenarioId = 'post-url-replacement-maximum'
    registerScenarioContract(scenarioId, { expectations: [], walCaptureCondition: 'cold' })
    const fixture = await createExplainWalCaptureFixture(scenarioId)
    const { input } = fixture
    try {
      const cold = await fixture.captureCold()
      const walFpi = (plan: unknown) => (plan as { Plan: { 'WAL FPI': number } }).Plan['WAL FPI']
      expect(walFpi(cold.plan)).toBeGreaterThan(0)
      const first: Awaited<ReturnType<typeof captureScenarioTwice>>[number][] = []
      const second = await captureScenarioTwice(
        [
          { ...input, planCacheMode: 'force_custom_plan' },
          { ...input, planCacheMode: 'force_generic_plan' },
        ],
        result => first.push(result),
      )
      expect(first).toHaveLength(2)
      expect(second).toHaveLength(2)
      for (const result of [...first, ...second]) {
        expect(walFpi(result.plan)).toBeGreaterThan(0)
        expect((result.plan as { Plan: { 'Actual Rows': number } }).Plan['Actual Rows']).toBe(1)
      }
      expect([...first, ...second].map(result => result.plan_cache_mode)).toEqual([
        'force_custom_plan',
        'force_generic_plan',
        'force_custom_plan',
        'force_generic_plan',
      ])
      expect(await fixture.readMarkdown()).toBe('')
    } finally {
      await fixture.cleanup()
    }
  })
})
