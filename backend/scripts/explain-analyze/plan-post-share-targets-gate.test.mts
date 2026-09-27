import { describe, expect, it } from 'vitest'
import type { ExplainResult } from '@data-stores/psql'
import { assertPostShareEligibilityIsTargetBounded } from './plan-post-share-targets-gate.mts'
import type { PlanNode } from './plan-nodes.mts'

function result(targets = 8, scans: PlanNode[] = indexedScans(targets)): ExplainResult {
  return {
    name: 'getPostFeedIds:force_generic_plan',
    scenario_id: 'post-feed-shares-sparse-new',
    query_text:
      'WITH shared_post_targets AS MATERIALIZED (SELECT DISTINCT post_id FROM shared_post_candidates), eligible_shared_posts AS MATERIALIZED (SELECT 1) SELECT 1',
    plan: {
      Plan: {
        'Node Type': 'Append',
        Plans: [
          {
            'Node Type': 'Aggregate',
            'Subplan Name': 'CTE shared_post_targets',
            'Group Key': ['shared_post_candidates.post_id'],
            'Actual Rows': targets,
            'Actual Loops': 1,
          },
          {
            'Node Type': 'Index Scan',
            'Subplan Name': 'CTE shared_post_candidates',
            'Actual Rows': targets * 8,
            'Actual Loops': 1,
          },
          { 'Node Type': 'Nested Loop', 'Subplan Name': 'CTE eligible_shared_posts', Plans: scans },
          {
            'Node Type': 'CTE Scan',
            'CTE Name': 'eligible_shared_posts',
            'Actual Rows': targets,
            'Actual Loops': 1,
          },
        ],
      },
    },
    execution_time_ms: 1,
    planning_time_ms: 1,
    timestamp: new Date().toISOString(),
  }
}

function indexedScans(targets: number): PlanNode[] {
  return ['posts', 'root_post'].map(alias => ({
    'Node Type': 'Index Scan',
    'Relation Name': 'posts__default',
    Alias: `${alias}_1`,
    'Index Cond': '(id = shared_post_targets.post_id)',
    'Actual Rows': 1,
    'Actual Loops': targets,
  }))
}

describe('post share target eligibility work', () => {
  it('accepts indexed post and root work once per distinct target', () => {
    for (const mode of ['force_custom_plan', 'force_generic_plan']) {
      const input = result()
      input.name = `getPostFeedIds:${mode}`
      expect(() => assertPostShareEligibilityIsTargetBounded(input)).not.toThrow()
    }
  })
  it('requires no share SQL when shares are disabled', () => {
    const input = { ...result(), scenario_id: 'post-feed-shares-disabled-all' }
    expect(() => assertPostShareEligibilityIsTargetBounded(input)).toThrow('omit disabled share')
    input.query_text = 'SELECT 1 FROM direct_posts'
    input.plan = { Plan: { 'Node Type': 'Index Scan', 'Relation Name': 'posts__default' } }
    expect(() => assertPostShareEligibilityIsTargetBounded(input)).not.toThrow()
    input.plan = {
      Plan: { 'Node Type': 'Index Scan', 'Relation Name': 'post_feed_shares__default' },
    }
    expect(() => assertPostShareEligibilityIsTargetBounded(input)).toThrow('omit disabled share')
  })
  it('requires zero post and root probes for zero targets', () => {
    const input = { ...result(0), scenario_id: 'post-feed-shares-empty' }
    expect(() => assertPostShareEligibilityIsTargetBounded(input)).not.toThrow()
    input.plan = result(0, indexedScans(1)).plan
    expect(() => assertPostShareEligibilityIsTargetBounded(input)).toThrow('for 0 distinct targets')
  })
  it('rejects repeated target probes despite low returned row counts', () => {
    expect(() => assertPostShareEligibilityIsTargetBounded(result(8, indexedScans(64)))).toThrow(
      '64 probes for 8 distinct targets',
    )
    expect(() => assertPostShareEligibilityIsTargetBounded(result(9))).toThrow(
      'exactly 8 distinct share targets',
    )
    expect(() => assertPostShareEligibilityIsTargetBounded(result(0))).toThrow(
      'exactly 8 distinct share targets',
    )
  })
  it('counts filtered and rechecked source rows', () => {
    for (const kind of ['Rows Removed by Filter', 'Rows Removed by Index Recheck']) {
      const scans = indexedScans(8)
      scans[0]![kind] = 1
      expect(() => assertPostShareEligibilityIsTargetBounded(result(8, scans))).toThrow(
        'processed 16 posts rows',
      )
    }
  })
  it('rejects broad or sequential eligibility access', () => {
    const input = result()
    input.plan = { Plan: { 'Node Type': 'Seq Scan', 'Relation Name': 'posts__default' } }
    expect(() => assertPostShareEligibilityIsTargetBounded(input)).toThrow(
      'materialize distinct share targets',
    )
    const scans = indexedScans(8)
    scans[1]!['Node Type'] = 'Seq Scan'
    expect(() => assertPostShareEligibilityIsTargetBounded(result(8, scans))).toThrow(
      'indexed root_post.id probes',
    )
    scans[1]!['Node Type'] = 'Index Scan'
    scans[1]!['Index Cond'] = '(created_by_id = $1)'
    expect(() => assertPostShareEligibilityIsTargetBounded(result(8, scans))).toThrow(
      'indexed root_post.id probes',
    )
    expect(() => assertPostShareEligibilityIsTargetBounded(result(8, []))).toThrow(
      'indexed posts.id probes',
    )
  })
  it('rejects eligibility spooling and delivery joins that multiply targets by deliveries', () => {
    const input = result()
    input.plan = {
      Plan: {
        'Node Type': 'Append',
        Plans: [
          ...(input.plan as { Plan: { Plans: PlanNode[] } }).Plan.Plans,
          {
            'Node Type': 'CTE Scan',
            'CTE Name': 'eligible_shared_posts',
            'Actual Rows': 8,
            'Actual Loops': 64,
          },
        ],
      },
    }
    expect(() => assertPostShareEligibilityIsTargetBounded(input)).toThrow(
      'rescanned 520 eligible target rows',
    )
    input.plan = {
      Plan: {
        'Node Type': 'Append',
        Plans: [
          ...(result().plan as { Plan: { Plans: PlanNode[] } }).Plan.Plans,
          {
            'Node Type': 'Nested Loop',
            'Join Filter': '(shared_post_candidates.post_id = eligible_shared_posts.id)',
            'Rows Removed by Join Filter': 8,
            'Actual Loops': 64,
          },
        ],
      },
    }
    expect(() => assertPostShareEligibilityIsTargetBounded(input)).toThrow(
      'rejected 512 delivery joins',
    )
  })
  it('counts eligibility join rejections and requires the materialized target plans', () => {
    expect(() =>
      assertPostShareEligibilityIsTargetBounded(
        result(8, [
          ...indexedScans(8),
          { 'Node Type': 'Nested Loop', 'Rows Removed by Join Filter': 2, 'Actual Loops': 8 },
        ]),
      ),
    ).toThrow('rejected 16 eligibility join rows')
    const input = result()
    input.plan = {}
    expect(() => assertPostShareEligibilityIsTargetBounded(input)).toThrow(
      'materialize distinct share targets',
    )
  })
  it('ignores unrelated service scenarios', () => {
    expect(() =>
      assertPostShareEligibilityIsTargetBounded({ ...result(), scenario_id: 'post-feed' }),
    ).not.toThrow()
    expect(() =>
      assertPostShareEligibilityIsTargetBounded({ ...result(), scenario_id: undefined }),
    ).not.toThrow()
  })
})
