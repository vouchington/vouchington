import { describe, expect, it } from 'vitest'
import type { ExplainResult } from '@data-stores/psql'
import { assertParentHistoryLowerBound } from './parent-history.mts'

function result(queryText: string, condition: Record<string, string>): ExplainResult {
  return {
    name: 'parent-history-test',
    query_text: queryText,
    plan: {
      Plan: {
        'Node Type': 'Aggregate',
        Plans: [
          {
            'Node Type': 'Index Scan',
            'Relation Name': 'post_clearance_changes__2026_02',
            ...condition,
          },
        ],
      },
    },
    execution_time_ms: 0,
    planning_time_ms: 0,
    timestamp: '2026-10-07T00:00:00.000Z',
  }
}

describe('assertParentHistoryLowerBound', () => {
  const boundedSql = 'SELECT 1 FROM post_clearance_changes WHERE post_id = $1 AND id >= $2::uuid'

  it.each(['Index Cond', 'Recheck Cond', 'Filter'])(
    'accepts an id lower bound in the history scan %s',
    conditionKey => {
      expect(() =>
        assertParentHistoryLowerBound(result(boundedSql, { [conditionKey]: '(id >= $2)' })),
      ).not.toThrow()
    },
  )

  it('rejects a parent-only query even when its scan visits few rows', () => {
    expect(() =>
      assertParentHistoryLowerBound(
        result('SELECT 1 FROM post_clearance_changes WHERE post_id = $1', {
          'Index Cond': '(post_id = $1)',
        }),
      ),
    ).toThrow(/must constrain post_clearance_changes\.id/)
  })

  it('rejects an id lower bound that the actual history scan does not apply', () => {
    expect(() =>
      assertParentHistoryLowerBound(result(boundedSql, { 'Index Cond': '(post_id = $1)' })),
    ).toThrow(/must constrain post_clearance_changes\.id/)
  })
})
