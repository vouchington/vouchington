import * as psql from '@data-stores/psql'
import type { ExplainPlanCacheMode, ExplainResult } from '@data-stores/psql'
import { vi } from 'vitest'

export type StubExplainCall = {
  name: string
  text: string
  values: readonly unknown[]
  options: {
    jit?: 'on' | 'off'
    planCacheMode?: ExplainPlanCacheMode
    localSettings?: Readonly<Record<string, string>>
    planOnly?: boolean
  }
}

/** Supplies canned plans to `explainAnalyze` so a capture can record probe costs. */
export function stubExplainPlans(selectPlan: (call: StubExplainCall) => unknown): {
  calls: StubExplainCall[]
  restore: () => void
} {
  const calls: StubExplainCall[] = []
  const spy = vi
    .spyOn(psql, 'explainAnalyze')
    .mockImplementation(async (name, input, values, options = {}): Promise<ExplainResult> => {
      const text = typeof input === 'string' ? input : input.text
      const call = { name, text, values: values ?? [], options }
      calls.push(call)
      return {
        name,
        query_text: text,
        plan: selectPlan(call),
        execution_time_ms: 1,
        planning_time_ms: 1,
        timestamp: '2026-10-17T00:00:00.000Z',
        plan_cache_mode: options.planCacheMode ?? 'auto',
      }
    })
  return { calls, restore: () => spy.mockRestore() }
}
