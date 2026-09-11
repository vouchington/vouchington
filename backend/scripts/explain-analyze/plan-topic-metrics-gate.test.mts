import { describe, expect, it } from 'vitest'
import type { ExplainResult } from '@data-stores/psql'
import { assertTopicMetricsBatchIsCandidateBounded } from './plan-topic-metrics-gate.mts'

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

const SET_BASED_QUERY = `
  WITH requested_topic_ids AS (SELECT DISTINCT id FROM combined_ids),
  discussion_counts AS (
    SELECT requested.id AS topic_id, COUNT(DISTINCT post.id)
    FROM requested_topic_ids requested
    JOIN relation__post__category__topic relation ON relation.object_id = requested.id
    JOIN posts post ON post.id = relation.subject_id
    GROUP BY requested.id
  )
  SELECT * FROM discussion_counts
`

describe('assertTopicMetricsBatchIsCandidateBounded', () => {
  it('accepts a set-based plan whose metric inputs stay within normal-seed ceilings', () => {
    const bounded = result('topic-metrics-batch', SET_BASED_QUERY, {
      Plan: {
        'Node Type': 'Nested Loop',
        'Actual Rows': 100,
        'Actual Loops': 1,
        Plans: [
          {
            'Node Type': 'Index Scan',
            'Relation Name': 'relation__post__category__topic__default',
            'Actual Rows': 20,
            'Actual Loops': 100,
            'Index Cond': '(object_id = requested.id)',
          },
          {
            'Node Type': 'Index Scan',
            'Relation Name': 'posts__default',
            'Actual Rows': 1,
            'Actual Loops': 2000,
            'Index Cond': '(id = relation.subject_id)',
          },
          {
            'Node Type': 'Index Scan',
            'Relation Name': 'rss_feed_item_sources__default',
            'Actual Rows': 10,
            'Actual Loops': 100,
            'Index Cond': '(rss_feed_id = feed.id)',
          },
        ],
      },
    })

    expect(() => assertTopicMetricsBatchIsCandidateBounded(bounded)).not.toThrow()
  })

  it('rejects the old view-based query shape', () => {
    const viewBased = result(
      'topic-metrics-batch',
      'SELECT vtm.* FROM view_topic_metrics vtm JOIN combined_ids ci ON ci.id = vtm.id',
      { Plan: { 'Node Type': 'Result' } },
    )

    expect(() => assertTopicMetricsBatchIsCandidateBounded(viewBased)).toThrow(
      'must constrain metric sources through requested_topic_ids',
    )
  })

  it('rejects a correlated aggregate SubPlan', () => {
    const correlated = result('topic-metrics-batch', SET_BASED_QUERY, {
      Plan: {
        'Node Type': 'Nested Loop',
        Plans: [
          {
            'Node Type': 'Aggregate',
            'Subplan Name': 'SubPlan 4',
            'Actual Rows': 1,
            'Actual Loops': 100,
          },
        ],
      },
    })

    expect(() => assertTopicMetricsBatchIsCandidateBounded(correlated)).toThrow(
      'must not execute correlated metric SubPlans',
    )
  })

  it('allows non-aggregate SubPlans inside joined eligibility views', () => {
    const eligibility = result('topic-metrics-batch', SET_BASED_QUERY, {
      Plan: {
        'Node Type': 'Nested Loop',
        Plans: [
          {
            'Node Type': 'Nested Loop',
            'Subplan Name': 'SubPlan 3',
            'Actual Rows': 1,
            'Actual Loops': 1,
          },
        ],
      },
    })

    expect(() => assertTopicMetricsBatchIsCandidateBounded(eligibility)).not.toThrow()
  })

  it('rejects metric-source work above the normal 100-topic seed ceiling', () => {
    const rescanned = result('topic-metrics-batch', SET_BASED_QUERY, {
      Plan: {
        'Node Type': 'Seq Scan',
        'Relation Name': 'relation__post__category__topic__default',
        'Actual Rows': 50_000,
        'Actual Loops': 1,
      },
    })

    expect(() => assertTopicMetricsBatchIsCandidateBounded(rescanned)).toThrow(
      /processed 50000 rows from .*expected at most 5000/,
    )
  })

  it('counts rows across loops when enforcing the work ceiling', () => {
    const repeated = result('topic-metrics-batch', SET_BASED_QUERY, {
      Plan: {
        'Node Type': 'Index Scan',
        'Relation Name': 'posts__default',
        'Actual Rows': 100,
        'Actual Loops': 100,
        'Index Cond': '(id = relation.subject_id)',
      },
    })

    expect(() => assertTopicMetricsBatchIsCandidateBounded(repeated)).toThrow(
      /processed 10000 rows from .*expected at most 5000/,
    )
  })

  it('counts rows discarded by scan filters when enforcing the work ceiling', () => {
    const broadScan = result('topic-metrics-batch', SET_BASED_QUERY, {
      Plan: {
        'Node Type': 'Seq Scan',
        'Relation Name': 'post_review_topic_ratings__default',
        'Actual Rows': 100,
        'Actual Loops': 1,
        'Rows Removed by Filter': 49_900,
      },
    })

    expect(() => assertTopicMetricsBatchIsCandidateBounded(broadScan)).toThrow(
      /processed 50000 rows from .*expected at most 5000/,
    )
  })

  it('ignores an unrelated scenario capture', () => {
    const unrelated = result('search-communities', 'SELECT * FROM view_topic_metrics', {
      Plan: { 'Node Type': 'Seq Scan', 'Relation Name': 'posts', 'Actual Rows': 100_000 },
    })

    expect(() => assertTopicMetricsBatchIsCandidateBounded(unrelated)).not.toThrow()
  })
})
