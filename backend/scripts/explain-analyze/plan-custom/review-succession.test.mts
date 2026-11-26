import type { ExplainResult, PlanNode } from '@vouchington/explain-plan'
import { describe, expect, it } from 'vitest'
import { assertReviewSuccessionCandidatePlanIfApplicable } from './review-succession.mts'

const interval =
  "((ROW(successor_post_id, id) > ROW($1, $2)) AND (ROW(successor_post_id, id) <= ROW($1, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))"

function result(historyScan: PlanNode, wrapper = 'Limit'): ExplainResult {
  return {
    name: 'history-page',
    scenario_id: 'review-succession-candidates',
    query_text: '/* listReviewSuccessionHistoryPage */ SELECT id',
    plan: {
      Plan: {
        'Node Type': wrapper,
        Plans: [
          historyScan,
          {
            'Node Type': 'Index Only Scan',
            'Relation Name': 'review_succession_topics',
            'Index Name': 'review_succession_topics_pkey',
            'Index Cond': '(review_succession_id = succession.id)',
            'Actual Rows': 1,
            'Actual Loops': 100,
          },
        ],
      },
    },
    execution_time_ms: 1,
    planning_time_ms: 1,
    timestamp: '2026-01-01T00:00:00Z',
  }
}

function history(): PlanNode {
  return {
    'Node Type': 'Index Scan',
    'Relation Name': 'review_successions',
    'Index Name': 'idx_review_successions__active_successor_post_id',
    'Index Cond': interval,
    'Actual Rows': 100,
    'Actual Loops': 1,
  }
}

describe('review succession raw history plan', () => {
  it('accepts a keyed bounded interval and topic probes', () => {
    expect(() => assertReviewSuccessionCandidatePlanIfApplicable(result(history()))).not.toThrow(
      /must (?:resolve review succession candidates|seek the bounded successor history interval)/,
    )
  })

  it.each([
    { 'Index Name': 'review_successions_pkey' },
    { 'Index Cond': `${interval} OR (successor_post_id = $3)` },
    { 'Index Cond': `NOT ${interval}` },
    { 'Node Type': 'Bitmap Heap Scan' },
    { 'Node Type': 'Seq Scan' },
    { 'Rows Removed by Filter': 1 },
    { 'Actual Loops': 2 },
    { 'Index Cond': interval.replace('<= ROW($1', '<= ROW($3') },
    {
      'Index Cond': interval.replace(
        'ffffffff-ffff-ffff-ffff-ffffffffffff',
        '00000000-0000-0000-0000-000000000000',
      ),
    },
    { 'Index Cond': '(successor_post_id = $1)' },
    { 'Index Name': 'idx_review_successions__successor_post_id' },
  ])('rejects an unproven or over-budget walk: %j', override => {
    expect(() =>
      assertReviewSuccessionCandidatePlanIfApplicable(result({ ...history(), ...override })),
    ).toThrow(
      /must (?:resolve review succession candidates|seek the bounded successor history interval)/,
    )
  })

  it.each(['Sort', 'Incremental Sort'])(
    'rejects an upstream %s even when output is small',
    wrapper => {
      expect(() =>
        assertReviewSuccessionCandidatePlanIfApplicable(result(history(), wrapper)),
      ).toThrow(
        /must (?:resolve review succession candidates|seek the bounded successor history interval)/,
      )
    },
  )

  it('rejects an unkeyed topic prefix even if its output is small', () => {
    const probe = result(history())
    probe.plan = {
      Plan: {
        'Node Type': 'Limit',
        Plans: [
          history(),
          {
            'Node Type': 'Index Only Scan',
            'Relation Name': 'review_succession_topics',
            'Index Name': 'review_succession_topics_pkey',
            'Actual Rows': 100,
            'Actual Loops': 1,
          },
        ],
      },
    }
    expect(() => assertReviewSuccessionCandidatePlanIfApplicable(probe)).toThrow(
      /must (?:resolve review succession candidates|seek the bounded successor history interval)/,
    )
  })

  it('accepts the FK index only when both active predicates are index conditions', () => {
    const node = {
      ...history(),
      'Index Name': 'idx_review_successions__successor_post_id',
      'Index Cond': `${interval} AND (automatically_restored_at IS NULL) AND (manual_override_at IS NULL)`,
    }
    expect(() => assertReviewSuccessionCandidatePlanIfApplicable(result(node))).not.toThrow(
      /must (?:resolve review succession candidates|seek the bounded successor history interval)/,
    )
  })
})
