import { describe, expect, it } from 'vitest'
import type { ExplainResult } from '@data-stores/psql'
import { assertCommittedAdmissionResponsePlanShapeIfApplicable } from './plan-admission-response-gate.mts'

function result(plan: unknown): ExplainResult {
  return {
    name: 'persistPostCategoryFinalization',
    scenario_id: 'post-admission-response-refresh',
    query_text: 'UPDATE post_admission_reservations',
    plan,
    execution_time_ms: 1,
    planning_time_ms: 1,
    timestamp: new Date().toISOString(),
  }
}

describe('committed admission response plan gate', () => {
  it('ignores unrelated scenarios', () => {
    expect(() =>
      assertCommittedAdmissionResponsePlanShapeIfApplicable({
        ...result({}),
        scenario_id: 'another-scenario',
      }),
    ).not.toThrow()
  })

  it('requires the retained-post index without an admission reservation sequential scan', () => {
    const indexed = result({
      Plan: {
        'Node Type': 'ModifyTable',
        Plans: [
          {
            'Node Type': 'Index Scan',
            'Relation Name': 'post_admission_reservations',
            'Index Name': 'idx_post_admission_reservations__committed_post_retention',
          },
        ],
      },
    })
    expect(() => assertCommittedAdmissionResponsePlanShapeIfApplicable(indexed)).not.toThrow()

    const scanned = result({
      Plan: {
        'Node Type': 'ModifyTable',
        Plans: [{ 'Node Type': 'Seq Scan', 'Relation Name': 'post_admission_reservations' }],
      },
    })
    expect(() => assertCommittedAdmissionResponsePlanShapeIfApplicable(scanned)).toThrow(
      'committed admission responses through',
    )
  })
})
