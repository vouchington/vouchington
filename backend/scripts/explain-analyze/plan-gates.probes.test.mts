import type { ExplainResult } from '@vouchington/explain-plan'
import { describe, expect, it } from 'vitest'
import { registerScenarioContract } from './plan-expectations.mts'
import { assertRequiredPlanShape } from './plan-gates.mts'

function result(scenarioId: string, node: Record<string, unknown>): ExplainResult {
  return {
    name: 'capturedQuery',
    scenario_id: scenarioId,
    query_text: 'SELECT id FROM posts',
    plan: { Plan: { 'Node Type': 'Result', 'Actual Rows': 1, 'Actual Loops': 1, Plans: [node] } },
    execution_time_ms: 1,
    planning_time_ms: 1,
    timestamp: '2026-01-01T00:00:00.000Z',
  }
}

describe('EXPLAIN input row budgets', () => {
  it('caps the rows a sort reads even when its parent consumes one result', () => {
    const scenario = 'rss-ingest-identities-at-cap'
    registerScenarioContract(scenario, {
      expectations: [{ kind: 'maxInputRows', nodeType: 'Sort', max: 500 }],
    })
    const sort = (rows: number) =>
      result(scenario, {
        'Node Type': 'Incremental Sort',
        'Actual Rows': 1,
        'Actual Loops': 1,
        Plans: [
          {
            'Node Type': 'Function Scan',
            'Parent Relationship': 'Outer',
            'Actual Rows': rows,
            'Actual Loops': 1,
          },
        ],
      })
    expect(() => assertRequiredPlanShape(sort(500))).not.toThrow()
    expect(() => assertRequiredPlanShape(sort(501))).toThrow(
      'processed 501 Sort input rows; expected at most 500',
    )
  })

  it('sums function scan input rows across loops and nodes', () => {
    const scenario = 'rss-ingest-source-associations-at-cap'
    registerScenarioContract(scenario, {
      expectations: [{ kind: 'maxInputRows', nodeType: 'Function Scan', max: 500 }],
    })
    const scan = (rows: number, loops: number) => ({
      'Node Type': 'Function Scan',
      'Actual Rows': rows,
      'Actual Loops': loops,
      'Rows Removed by Filter': 1,
    })
    const plan = (rows: number) =>
      result(scenario, {
        'Node Type': 'Append',
        Plans: [scan(249, 1), scan(rows, 2), scan(0, 0)],
      })
    expect(() => assertRequiredPlanShape(plan(124))).not.toThrow()
    expect(() => assertRequiredPlanShape(plan(125))).toThrow(
      'processed 502 Function Scan input rows; expected at most 500',
    )
  })
})
