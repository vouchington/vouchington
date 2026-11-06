import { describe, expect, it } from 'vitest'
import { explainAnalyze, write } from '@data-stores/psql'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users-direct'
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

  it('conditions each recorded WAL capture while preserving rollback and both plan modes', async () => {
    const user = await createTestUserDirect()
    const scenarioId = 'post-url-replacement-maximum'
    registerScenarioContract(scenarioId, { expectations: [], walCaptureCondition: 'warm' })
    const input = {
      name: 'wal-condition-test',
      text: `/* walConditionTest */ UPDATE users SET markdown = $2
        WHERE id = $1 AND current_setting('application_name') = $3 RETURNING id`,
      values: [user.id, 'temporary change', 'wal-condition-test'],
      scenarioId,
      captureIndex: 0,
      localSettings: { application_name: 'wal-condition-test' },
    }
    try {
      await write('/* walConditionTestCheckpoint */ CHECKPOINT')
      const cold = await explainAnalyze(input.name, input.text, input.values, {
        localSettings: input.localSettings,
        planCacheMode: 'force_custom_plan',
      })
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
        expect(walFpi(result.plan)).toBe(0)
        expect((result.plan as { Plan: { 'Actual Rows': number } }).Plan['Actual Rows']).toBe(1)
      }
      expect([...first, ...second].map(result => result.plan_cache_mode)).toEqual([
        'force_custom_plan',
        'force_generic_plan',
        'force_custom_plan',
        'force_generic_plan',
      ])
      const { rows } = await write(
        '/* walConditionTestRead */ SELECT markdown FROM users WHERE id = $1',
        [user.id],
      )
      expect(rows[0]?.markdown).toBe('')
    } finally {
      await write('/* walConditionTestCleanup */ DELETE FROM users WHERE id = $1', [user.id])
    }
  })
})
