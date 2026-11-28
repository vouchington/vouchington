import type { ExplainResult } from '@vouchington/explain-plan'
import { describe, expect, it } from 'vitest'
import { assertCorePlanCheck } from './core-special.mts'

function sortedRelationListing(): ExplainResult {
  return {
    name: 'entity-relations-newest',
    scenario_id: 'entity-relations-newest',
    // ast-grep-ignore: no-sql-in-backend-tests -- synthetic ExplainResult fixture for custom plan-gate unit test
    query_text: 'SELECT 1',
    plan: { Plan: { 'Node Type': 'Sort', 'Actual Rows': 1, 'Actual Loops': 1 } },
    execution_time_ms: 0,
    planning_time_ms: 0,
    timestamp: '2026-01-01T00:00:00.000Z',
  }
}

describe('relation listing order', () => {
  it('rejects an explicit sort', () => {
    expect(() => assertCorePlanCheck('relationListingOrder', sortedRelationListing())).toThrow(
      'entity-relations-newest must use relation index order without an explicit Sort',
    )
  })
})
