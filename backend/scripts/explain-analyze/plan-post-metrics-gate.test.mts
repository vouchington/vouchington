import { describe, expect, it } from 'vitest'
import type { ExplainResult } from '@data-stores/psql'
import { assertPostMetricsBatchIsCandidateBounded } from './plan-post-metrics-gate.mts'

function result(queryText: string, plan: unknown): ExplainResult {
  return {
    name: 'getPostMetricsByAnyBatch:force_generic_plan',
    scenario_id: 'post-metrics-batch',
    query_text: queryText,
    plan,
    execution_time_ms: 1,
    planning_time_ms: 1,
    timestamp: new Date().toISOString(),
  }
}

const SET_BASED_QUERY = `WITH RECURSIVE requested_posts AS (
  SELECT DISTINCT id, updated_at FROM combined_posts
), descendant_metrics AS (
  SELECT requested.id, COUNT(*) FROM requested_posts requested
  JOIN posts candidate_post ON candidate_post.root_id = requested.id GROUP BY requested.id
) SELECT * FROM descendant_metrics`

describe('assertPostMetricsBatchIsCandidateBounded', () => {
  it('accepts a set-based requested-post plan', () => {
    expect(() =>
      assertPostMetricsBatchIsCandidateBounded(
        result(SET_BASED_QUERY, {
          Plan: {
            'Node Type': 'Index Scan',
            'Relation Name': 'posts__default',
            'Actual Rows': 1,
            'Actual Loops': 200,
          },
        }),
      ),
    ).not.toThrow()
  })

  it('rejects the former correlated query shape', () => {
    expect(() =>
      assertPostMetricsBatchIsCandidateBounded(
        result('SELECT (SELECT COUNT(*) FROM posts WHERE root_id = cp.id) FROM combined_posts cp', {
          Plan: { 'Node Type': 'Result' },
        }),
      ),
    ).toThrow('must constrain metric sources through requested_posts')
  })

  it('rejects correlated SubPlans', () => {
    expect(() =>
      assertPostMetricsBatchIsCandidateBounded(
        result(SET_BASED_QUERY, {
          Plan: { 'Node Type': 'Aggregate', 'Subplan Name': 'SubPlan 1' },
        }),
      ),
    ).toThrow('must not execute correlated metric SubPlans')
  })

  it('allows non-aggregate SubPlans inside joined eligibility views', () => {
    expect(() =>
      assertPostMetricsBatchIsCandidateBounded(
        result(SET_BASED_QUERY, {
          Plan: { 'Node Type': 'Nested Loop', 'Subplan Name': 'SubPlan 4' },
        }),
      ),
    ).not.toThrow()
  })

  it('rejects source work above the normal 200-post seed ceiling', () => {
    expect(() =>
      assertPostMetricsBatchIsCandidateBounded(
        result(SET_BASED_QUERY, {
          Plan: {
            'Node Type': 'Seq Scan',
            'Relation Name': 'posts__default',
            'Actual Rows': 100_000,
            'Actual Loops': 1,
          },
        }),
      ),
    ).toThrow(/processed 100000 rows from posts.*expected at most 10000/)
  })

  it('counts filtered and index-rechecked bookmark rows as source work', () => {
    expect(() =>
      assertPostMetricsBatchIsCandidateBounded(
        result(SET_BASED_QUERY, {
          Plan: {
            'Node Type': 'Bitmap Heap Scan',
            'Relation Name': 'relation__user__save__post',
            'Actual Rows': 100,
            'Actual Loops': 2,
            'Rows Removed by Filter': 300,
            'Rows Removed by Index Recheck': 200,
          },
        }),
      ),
    ).toThrow(/processed 1200 rows from relation__user__save__post.*expected at most 1000/)
  })

  it('allows the indexed bookmark work for every requested post', () => {
    expect(() =>
      assertPostMetricsBatchIsCandidateBounded(
        result(SET_BASED_QUERY, {
          Plan: {
            'Node Type': 'Index Scan',
            'Relation Name': 'relation__user__follow__post',
            'Actual Rows': 1,
            'Actual Loops': 200,
          },
        }),
      ),
    ).not.toThrow()
  })

  it('rejects a full scan of the normal bookmark seed', () => {
    expect(() =>
      assertPostMetricsBatchIsCandidateBounded(
        result(SET_BASED_QUERY, {
          Plan: {
            'Node Type': 'Seq Scan',
            'Relation Name': 'relation__user__follow__post',
            'Actual Rows': 5000,
            'Actual Loops': 1,
          },
        }),
      ),
    ).toThrow(/processed 5000 rows from relation__user__follow__post.*expected at most 1000/)
  })

  it('ignores unrelated scenarios', () => {
    const unrelated = result('SELECT * FROM posts', {
      Plan: { 'Node Type': 'Seq Scan', 'Relation Name': 'posts', 'Actual Rows': 100_000 },
    })
    unrelated.scenario_id = 'post-search-new'
    expect(() => assertPostMetricsBatchIsCandidateBounded(unrelated)).not.toThrow()
  })
})
