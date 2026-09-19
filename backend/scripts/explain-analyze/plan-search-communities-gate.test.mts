import { describe, expect, it } from 'vitest'
import type { ExplainResult } from '@data-stores/psql'
import { assertSearchCommunitiesEligibilityIsIndexed } from './plan-search-communities-gate.mts'

function result(scenarioId: string, queryText: string, plan: unknown): ExplainResult {
  return {
    name: scenarioId,
    scenario_id: scenarioId,
    query_text: queryText,
    plan,
    execution_time_ms: 1,
    planning_time_ms: 1,
    timestamp: new Date().toISOString(),
  }
}

describe('assertSearchCommunitiesEligibilityIsIndexed', () => {
  it('accepts a search-communities plan whose posts accesses are all indexed', () => {
    const indexed = result('search-communities', 'SELECT * FROM view_community_metrics vm', {
      Plan: {
        'Node Type': 'Nested Loop',
        Plans: [
          {
            'Node Type': 'Index Scan',
            'Relation Name': 'posts__default',
            Alias: 'p',
            'Index Cond': '(community_id = c_1.id)',
          },
          {
            'Node Type': 'Index Scan',
            'Relation Name': 'posts__default',
            Alias: 'candidate_post',
            'Index Cond': '(id = cpr.post_id)',
          },
          {
            'Node Type': 'Index Scan',
            'Relation Name': 'posts__default',
            Alias: 'root_post',
            'Index Cond': '(id = COALESCE(candidate_post.root_id, candidate_post.id))',
          },
        ],
      },
    })
    expect(() => assertSearchCommunitiesEligibilityIsIndexed(indexed)).not.toThrow()
  })

  it('accepts a constrained posts bitmap heap scan with a non-qualifier subplan', () => {
    const bitmapIndexed = result(
      'search-communities-member',
      'SELECT * FROM view_community_metrics vm',
      {
        Plan: {
          'Node Type': 'Nested Loop',
          Plans: [
            {
              'Node Type': 'Bitmap Heap Scan',
              'Relation Name': 'posts__default',
              Alias: 'p',
              'Recheck Cond': '(community_id = c_1.id)',
              Plans: [
                {
                  'Node Type': 'Bitmap Index Scan',
                  'Index Name': 'posts__default_community_id_idx',
                  'Index Cond': '(community_id = c_1.id)',
                },
                {
                  'Node Type': 'CTE Scan',
                  'Parent Relationship': 'SubPlan',
                  'CTE Name': 'moderation_context',
                },
              ],
            },
            {
              'Node Type': 'Index Scan',
              'Relation Name': 'posts__default',
              Alias: 'candidate_post',
              'Index Cond': '(id = cpr.post_id)',
            },
          ],
        },
      },
    )
    expect(() => assertSearchCommunitiesEligibilityIsIndexed(bitmapIndexed)).not.toThrow()
  })

  it('rejects a posts bitmap heap scan without a constrained community-index lookup', () => {
    const unconstrainedBitmap = result(
      'search-communities-member',
      'SELECT * FROM view_community_metrics vm',
      {
        Plan: {
          'Node Type': 'Bitmap Heap Scan',
          'Relation Name': 'posts__default',
          Alias: 'p',
          Plans: [
            {
              'Node Type': 'Bitmap Index Scan',
              'Index Name': 'posts__default_community_id_idx',
            },
          ],
        },
      },
    )
    expect(() => assertSearchCommunitiesEligibilityIsIndexed(unconstrainedBitmap)).toThrow(
      'must resolve view_community_metrics.post_count through indexed posts lookups',
    )
  })

  it('rejects a posts bitmap heap scan backed by a different index', () => {
    const wrongBitmapIndex = result(
      'search-communities-member',
      'SELECT * FROM view_community_metrics vm',
      {
        Plan: {
          'Node Type': 'Bitmap Heap Scan',
          'Relation Name': 'posts__default',
          Alias: 'p',
          Plans: [
            {
              'Node Type': 'Bitmap Index Scan',
              'Index Name': 'posts__default_post_type_idx',
              'Index Cond': "(post_type = 'discussion'::post_types)",
            },
          ],
        },
      },
    )
    expect(() => assertSearchCommunitiesEligibilityIsIndexed(wrongBitmapIndex)).toThrow(
      'must resolve view_community_metrics.post_count through indexed posts lookups',
    )
  })

  it('rejects a bitmap OR when any alternative is not community-bound', () => {
    const partlyBoundBitmapOr = result(
      'search-communities-member',
      'SELECT * FROM view_community_metrics vm',
      {
        Plan: {
          'Node Type': 'Bitmap Heap Scan',
          'Relation Name': 'posts__default',
          Alias: 'p',
          Plans: [
            {
              'Node Type': 'BitmapOr',
              Plans: [
                {
                  'Node Type': 'Bitmap Index Scan',
                  'Index Name': 'posts__default_community_id_idx',
                  'Index Cond': '(community_id = c_1.id)',
                },
                {
                  'Node Type': 'Bitmap Index Scan',
                  'Index Name': 'posts__default_post_type_idx',
                  'Index Cond': "(post_type = 'discussion'::post_types)",
                },
              ],
            },
          ],
        },
      },
    )
    expect(() => assertSearchCommunitiesEligibilityIsIndexed(partlyBoundBitmapOr)).toThrow(
      'must resolve view_community_metrics.post_count through indexed posts lookups',
    )
  })

  it('accepts a bitmap AND when a conjunct is community-bound', () => {
    const communityBoundBitmapAnd = result(
      'search-communities-member',
      'SELECT * FROM view_community_metrics vm',
      {
        Plan: {
          'Node Type': 'Bitmap Heap Scan',
          'Relation Name': 'posts__default',
          Alias: 'p',
          Plans: [
            {
              'Node Type': 'BitmapAnd',
              Plans: [
                {
                  'Node Type': 'Bitmap Index Scan',
                  'Index Name': 'posts__default_community_id_idx',
                  'Index Cond': '(community_id = c_1.id)',
                },
                {
                  'Node Type': 'Bitmap Index Scan',
                  'Index Name': 'posts__default_post_type_idx',
                  'Index Cond': "(post_type = 'discussion'::post_types)",
                },
              ],
            },
          ],
        },
      },
    )
    expect(() => assertSearchCommunitiesEligibilityIsIndexed(communityBoundBitmapAnd)).not.toThrow()
  })

  it('rejects a sequential posts scan', () => {
    const sequential = result('search-communities', 'SELECT * FROM view_community_metrics vm', {
      Plan: {
        'Node Type': 'Seq Scan',
        'Relation Name': 'posts__default',
        Alias: 'p',
        Filter: '(community_id = c_1.id)',
      },
    })
    expect(() => assertSearchCommunitiesEligibilityIsIndexed(sequential)).toThrow(
      'must resolve view_community_metrics.post_count through indexed posts lookups',
    )
  })

  it('rejects a search-communities plan that rescans posts per candidate', () => {
    const rescanned = result(
      'search-communities-has-list-items',
      'SELECT * FROM view_community_metrics vm',
      {
        Plan: {
          'Node Type': 'Nested Loop',
          Plans: [
            {
              'Node Type': 'Index Scan',
              'Relation Name': 'posts__default',
              Alias: 'p',
              'Index Cond': '(community_id = c_1.id)',
            },
            {
              // The CTE/UNION shape: an unconstrained, per-loop Index Scan with no Index Cond.
              'Node Type': 'Index Scan',
              'Relation Name': 'posts__default',
              Alias: 'root_post',
            },
          ],
        },
      },
    )
    expect(() => assertSearchCommunitiesEligibilityIsIndexed(rescanned)).toThrow(
      'must resolve view_community_metrics.post_count through indexed posts lookups',
    )
  })

  it('ignores a search-communities capture that does not join view_community_metrics', () => {
    const unrelated = result('search-communities-text', 'SELECT id FROM communities c', {
      Plan: { 'Node Type': 'Seq Scan', 'Relation Name': 'communities' },
    })
    expect(() => assertSearchCommunitiesEligibilityIsIndexed(unrelated)).not.toThrow()
  })
})
