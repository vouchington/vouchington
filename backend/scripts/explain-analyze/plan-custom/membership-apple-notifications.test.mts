import { describe, expect, it } from 'vitest'
import type { ExplainResult } from '@data-stores/psql'
import { assertAppleNotificationRecoveryPlan } from './membership-apple-notifications.mts'

function result(
  index: string,
  rows: number,
  sorted = false,
  mode: 'force_custom_plan' | 'force_generic_plan' = 'force_generic_plan',
): ExplainResult {
  const scan = {
    'Node Type': 'Index Only Scan',
    'Relation Name': 'membership_provider_evidence_records',
    'Index Name': index,
    'Actual Rows': rows,
    'Actual Loops': 1,
  }
  return {
    name: `findRecoverableAppleNotificationJobs:${mode}`,
    query_text: '/* findRecoverableAppleNotificationJobs */ SELECT 1',
    plan: {
      Plan: {
        'Node Type': 'Result',
        Plans: [
          {
            'Node Type': 'Limit',
            'Subplan Name': 'CTE candidate_page',
            Plans: sorted ? [{ 'Node Type': 'Sort', Plans: [scan] }] : [scan],
          },
        ],
      },
    },
    execution_time_ms: 0,
    planning_time_ms: 0,
    timestamp: '2026-10-29T00:00:00.000Z',
    plan_cache_mode: mode,
  }
}

describe('Apple notification recovery generic candidate plan', () => {
  const ordered = 'idx_membership_provider_evidence_records__pending_received_at'
  const pendingId = 'idx_membership_provider_evidence_records__pending_id'

  it('accepts an ordered, bounded pending evidence page', () => {
    expect(() => assertAppleNotificationRecoveryPlan(result(ordered, 500))).not.toThrow()
  })

  it('rejects a generic plan that falls back to the pending ID index', () => {
    expect(() => assertAppleNotificationRecoveryPlan(result(pendingId, 500))).toThrow(
      /bounded ordered pending-evidence index page/,
    )
  })

  it('rejects a broad or sorted generic candidate page', () => {
    expect(() => assertAppleNotificationRecoveryPlan(result(ordered, 1_501))).toThrow(
      /bounded ordered pending-evidence index page/,
    )
    expect(() => assertAppleNotificationRecoveryPlan(result(ordered, 500, true))).toThrow(
      /bounded ordered pending-evidence index page/,
    )
  })

  it('permits the measured custom-plan index alternative', () => {
    expect(() =>
      assertAppleNotificationRecoveryPlan(result(pendingId, 2_000, true, 'force_custom_plan')),
    ).not.toThrow()
  })
})
