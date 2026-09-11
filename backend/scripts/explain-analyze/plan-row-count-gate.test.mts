import { describe, expect, it } from 'vitest'
import type { ExplainResult } from '@data-stores/psql'
import { assertPlanReturnedRows } from './plan-row-count-gate.mts'

function result(scenarioId: string, queryText: string, plan: unknown): ExplainResult {
  return {
    name: scenarioId,
    scenario_id: scenarioId,
    capture_index: 0,
    query_text: queryText,
    plan,
    execution_time_ms: 1,
    planning_time_ms: 1,
    timestamp: new Date().toISOString(),
  }
}

describe('assertPlanReturnedRows', () => {
  it('rejects a plan whose root node returned zero rows', () => {
    const empty = result('topic-rating-stats', 'SELECT topics', {
      Plan: { 'Node Type': 'Aggregate', 'Actual Rows': 0 },
    })
    expect(() => assertPlanReturnedRows(empty)).toThrow('no analyzable plan')
  })

  it('rejects a result with no analyzable plan', () => {
    const missingPlan = result('topic-rating-stats', 'SELECT topics', {})
    expect(() => assertPlanReturnedRows(missingPlan)).toThrow('no analyzable plan')

    const nullPlan = result('topic-rating-stats', 'SELECT topics', null)
    expect(() => assertPlanReturnedRows(nullPlan)).toThrow('no analyzable plan')
  })

  it('rejects a non-numeric Actual Rows value', () => {
    const nonNumeric = result('topic-rating-stats', 'SELECT topics', {
      Plan: { 'Node Type': 'Aggregate', 'Actual Rows': '0' },
    })
    expect(() => assertPlanReturnedRows(nonNumeric)).toThrow('no analyzable plan')
  })

  it('allows a plan whose root node returned real rows', () => {
    const populated = result('topic-rating-stats', 'SELECT topics', {
      Plan: { 'Node Type': 'Aggregate', 'Actual Rows': 1 },
    })
    expect(() => assertPlanReturnedRows(populated)).not.toThrow()
  })

  it('allows the unavailable support-draft reservation only with indexed support-message row evidence', () => {
    const unavailableReservation = result(
      'support-draft-generation-reservation',
      'INSERT INTO runs',
      {
        Plan: {
          'Node Type': 'ModifyTable',
          'Actual Rows': 0,
          Plans: [
            {
              'Node Type': 'Index Scan',
              'Relation Name': 'support_messages',
              'Index Name': 'uq_support_messages__thread_id',
              'Actual Rows': 1,
            },
          ],
        },
      },
    )
    expect(() => assertPlanReturnedRows(unavailableReservation)).not.toThrow()
  })

  it('rejects an unavailable support-draft reservation without real indexed support-message rows', () => {
    const noIndexedRows = result('support-draft-generation-reservation', 'INSERT INTO runs', {
      Plan: {
        'Node Type': 'ModifyTable',
        'Actual Rows': 0,
        Plans: [
          {
            'Node Type': 'Index Scan',
            'Relation Name': 'support_messages',
            'Index Name': 'uq_support_messages__thread_id',
            'Actual Rows': 0,
          },
        ],
      },
    })
    expect(() => assertPlanReturnedRows(noIndexedRows)).toThrow('no analyzable plan')
  })

  it('allows a RETURNING-bearing write whose root node reports rows written', () => {
    const upsertWithReturning = result('topic-rating-stats', 'INSERT INTO topic_metrics', {
      Plan: {
        'Node Type': 'ModifyTable',
        'Relation Name': 'topic_metrics',
        'Actual Rows': 1,
        Plans: [{ 'Node Type': 'Result', 'Actual Rows': 1 }],
      },
    })
    expect(() => assertPlanReturnedRows(upsertWithReturning)).not.toThrow()
  })
})
