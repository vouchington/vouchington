import type { ExplainResult } from '@data-stores/psql'
import { describe, expect, it } from 'vitest'
import { assertReviewSuccessionCandidatePlanIfApplicable } from './plan-review-succession-gate.mts'

describe('review succession candidate plan gate', () => {
  it('accepts bounded indexed access and rejects a post scan', () => {
    const indexed = result({
      'Node Type': 'Nested Loop',
      Plans: [
        { 'Node Type': 'Index Scan', 'Relation Name': 'posts', 'Actual Rows': 2 },
        {
          'Node Type': 'Index Only Scan',
          'Relation Name': 'post_review_topic_ratings__default',
          'Actual Rows': 4,
        },
      ],
    })
    expect(() => assertReviewSuccessionCandidatePlanIfApplicable(indexed)).not.toThrow()

    const scanned = result({ 'Node Type': 'Seq Scan', 'Relation Name': 'posts' })
    expect(() => assertReviewSuccessionCandidatePlanIfApplicable(scanned)).toThrow(
      'indexed, bounded',
    )
    expect(() =>
      assertReviewSuccessionCandidatePlanIfApplicable(
        result({ 'Node Type': 'Index Scan', 'Relation Name': 'posts', 'Actual Rows': 2 }),
      ),
    ).toThrow('indexed, bounded')
  })
})

function result(plan: Record<string, unknown>): ExplainResult {
  return {
    name: 'listLockedReviewSuccessionCandidates',
    scenario_id: 'review-succession-candidates',
    query_text: 'SELECT candidate reviews',
    plan,
    execution_time_ms: 1,
    planning_time_ms: 1,
    timestamp: new Date().toISOString(),
  }
}
