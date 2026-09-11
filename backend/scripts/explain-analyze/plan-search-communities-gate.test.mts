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
