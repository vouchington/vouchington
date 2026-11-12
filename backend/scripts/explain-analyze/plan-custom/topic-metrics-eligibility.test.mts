import type { ExplainResult } from '@data-stores/psql'
import { describe, expect, it } from 'vitest'
import { assertTopicMetricsEligibilityProbes } from './topic-metrics-eligibility.mts'

type Node = Record<string, unknown>

function candidate(overrides: Node = {}): Node {
  return {
    'Node Type': 'Index Scan',
    'Relation Name': 'posts__default',
    Alias: 'candidate_post',
    'Index Cond': '(id = relation.subject_id)',
    'Actual Rows': 1,
    'Actual Loops': 6,
    ...overrides,
  }
}

function root(overrides: Node = {}): Node {
  return {
    'Node Type': 'Index Scan',
    'Relation Name': 'posts__default',
    Alias: 'root_post',
    'Index Cond': '(id = COALESCE(candidate_post.root_post_id, candidate_post.id))',
    'Actual Rows': 1,
    'Actual Loops': 6,
    ...overrides,
  }
}

function scalar(children: Node[], overrides: Node = {}): Node {
  return {
    'Node Type': 'Limit',
    'Parent Relationship': 'SubPlan',
    'Plan Rows': 1,
    'Actual Rows': 1,
    Plans: [{ 'Node Type': 'Nested Loop', Plans: children }],
    ...overrides,
  }
}

function result(plan: Node): ExplainResult {
  return {
    name: 'topic-metrics-test',
    query_text: '/* getTopicMetricsByAnyBatch */ SELECT 1',
    plan: { Plan: plan },
    execution_time_ms: 0,
    planning_time_ms: 0,
    timestamp: '2026-11-12T00:00:00.000Z',
  }
}

const failure = /eligibility.*probe/

describe('topic metrics eligibility point probes', () => {
  it('accepts keyed candidates and roots within each scalar eligibility probe', () => {
    for (const condition of ['(id = relation.subject_id)', '(id = rating.post_id)']) {
      expect(() =>
        assertTopicMetricsEligibilityProbes(
          result(scalar([candidate({ 'Index Cond': condition }), root()])),
        ),
      ).not.toThrow()
    }
  })

  it('rejects flattened eligibility even with indexed candidate and root scans', () => {
    expect(() =>
      assertTopicMetricsEligibilityProbes(
        result({ 'Node Type': 'Nested Loop', Plans: [candidate(), root()] }),
      ),
    ).toThrow(failure)
  })

  it('rejects an unrelated sibling limit or an outer result limit', () => {
    for (const plan of [
      { 'Node Type': 'Nested Loop', Plans: [scalar([]), candidate(), root()] },
      { 'Node Type': 'Limit', 'Plan Rows': 1, Plans: [candidate(), root()] },
    ])
      expect(() => assertTopicMetricsEligibilityProbes(result(plan))).toThrow(failure)
  })

  it('rejects root id equality applied as a filter instead of an index condition', () => {
    expect(() =>
      assertTopicMetricsEligibilityProbes(
        result(
          scalar([
            candidate(),
            root({ 'Index Cond': undefined, Filter: '(id = candidate_post.id)' }),
          ]),
        ),
      ),
    ).toThrow(failure)
  })

  it('rejects a candidate bound only by post type and work exceeding one row per seek', () => {
    for (const scan of [
      candidate({ 'Index Cond': "(post_type = 'discussion')" }),
      candidate({ 'Rows Removed by Filter': 1 }),
    ])
      expect(() => assertTopicMetricsEligibilityProbes(result(scalar([scan, root()])))).toThrow(
        failure,
      )
  })

  it('rejects a scalar subplan that can return multiple eligibility rows', () => {
    expect(() =>
      assertTopicMetricsEligibilityProbes(
        result(scalar([candidate(), root()], { 'Plan Rows': 2 })),
      ),
    ).toThrow(failure)
  })

  it('rejects a plan without both candidate and root probes', () => {
    expect(() => assertTopicMetricsEligibilityProbes(result(scalar([candidate()])))).toThrow(
      failure,
    )
  })
})
