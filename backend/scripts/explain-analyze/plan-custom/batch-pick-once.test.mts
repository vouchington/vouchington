import { describe, expect, it } from 'vitest'
import type { ExplainResult } from '@data-stores/psql'
import { assertBatchPickEvaluatedOnce } from './batch-pick-once.mts'

function result(plans: Record<string, unknown>[]): ExplainResult {
  return {
    name: 'batch-pick-test',
    query_text: 'DELETE',
    plan: { Plan: { 'Node Type': 'ModifyTable', Plans: plans } },
    execution_time_ms: 0,
    planning_time_ms: 0,
    timestamp: '2026-10-07T00:00:00.000Z',
  }
}

describe('assertBatchPickEvaluatedOnce', () => {
  it('accepts a pick that runs once', () => {
    expect(() =>
      assertBatchPickEvaluatedOnce(result([{ 'Node Type': 'Limit', 'Actual Loops': 1 }])),
    ).not.toThrow()
  })

  it('rejects a pick rescanned under a join', () => {
    expect(() =>
      assertBatchPickEvaluatedOnce(result([{ 'Node Type': 'Limit', 'Actual Loops': 3 }])),
    ).toThrow('more than once')
  })

  it('rejects a Limit that reports no Actual Loops', () => {
    expect(() => assertBatchPickEvaluatedOnce(result([{ 'Node Type': 'Limit' }]))).toThrow(
      'without Actual Loops',
    )
  })

  it('rejects a plan with no Limit pick', () => {
    expect(() => assertBatchPickEvaluatedOnce(result([{ 'Node Type': 'Seq Scan' }]))).toThrow(
      'must plan its batch pick',
    )
  })
})
