import { describe, expect, it } from 'vitest'
import type { ExplainResult, PlanNode } from '@vouchington/explain-plan'
import { assertTopicAliasPrefixCandidates } from './topic-alias-prefix.mts'

function makePlan({
  indexName = 'idx_topic_aliases__alias_c',
  indexCond = '(((alias)::text >= (lower($1))::text) AND ((alias)::text < (lower($1))::text))',
  aliasRows = 11,
  topicRows = 11,
  topicIndex = 'topics_pkey',
  topicNodeType = 'Index Scan',
  withSort = false,
}: {
  indexName?: string
  indexCond?: string
  aliasRows?: number
  topicRows?: number
  topicIndex?: string
  topicNodeType?: string
  withSort?: boolean
} = {}): PlanNode {
  const joinNode: PlanNode = {
    'Node Type': 'Nested Loop',
    'Actual Rows': Math.min(aliasRows, topicRows),
    'Actual Loops': 1,
    Plans: [
      {
        'Node Type': 'Index Scan',
        'Relation Name': 'topic_aliases',
        'Index Name': indexName,
        'Index Cond': indexCond,
        'Actual Rows': aliasRows,
        'Actual Loops': 1,
      },
      {
        'Node Type': topicNodeType,
        'Relation Name': 'topics',
        ...(topicNodeType === 'Index Scan' ? { 'Index Name': topicIndex } : {}),
        'Actual Rows': 1,
        'Actual Loops': topicRows,
      },
    ],
  }
  return {
    'Node Type': 'Limit',
    'Actual Rows': Math.min(aliasRows, topicRows),
    'Actual Loops': 1,
    Plans: withSort
      ? [{ 'Node Type': 'Sort', 'Actual Rows': aliasRows, 'Actual Loops': 1, Plans: [joinNode] }]
      : [joinNode],
  }
}

function makeResult(scenarioId: string, plan: PlanNode): ExplainResult {
  return {
    name: 'searchTopicAliases:force_generic_plan',
    scenario_id: scenarioId,
    query_text: '/* searchTopicAliases */ SELECT 1',
    plan,
    execution_time_ms: 0.06,
    planning_time_ms: 0.01,
    plan_cache_mode: 'force_generic_plan',
    timestamp: '2026-11-28T00:00:00.000Z',
  }
}

describe('assertTopicAliasPrefixCandidates', () => {
  it('accepts ordered no-sort selective, broad, and cursor plans backed by idx_topic_aliases__alias_c', () => {
    expect(() =>
      assertTopicAliasPrefixCandidates(
        makeResult(
          'search-topic-aliases-selective-prefix',
          makePlan({ aliasRows: 11, topicRows: 11 }),
        ),
      ),
    ).not.toThrow()

    expect(() =>
      assertTopicAliasPrefixCandidates(
        makeResult('search-topic-aliases', makePlan({ aliasRows: 26, topicRows: 26 })),
      ),
    ).not.toThrow()

    expect(() =>
      assertTopicAliasPrefixCandidates(
        makeResult(
          'search-topic-aliases-cursor',
          makePlan({
            aliasRows: 26,
            topicRows: 26,
            indexCond:
              '(((alias)::text >= (lower($1))::text) AND ((alias)::text < (lower($1))::text) AND ((alias)::text > ($3)::text))',
          }),
        ),
      ),
    ).not.toThrow()
  })

  it('rejects a walk of topic_aliases_alias_key instead of idx_topic_aliases__alias_c', () => {
    expect(() =>
      assertTopicAliasPrefixCandidates(
        makeResult(
          'search-topic-aliases-selective-prefix',
          makePlan({ indexName: 'topic_aliases_alias_key', indexCond: '' }),
        ),
      ),
    ).toThrow(/idx_topic_aliases__alias_c/)
  })

  it('rejects missing upper bound, non-alias bounds, missing cursor bound, or a Sort node', () => {
    expect(() =>
      assertTopicAliasPrefixCandidates(
        makeResult(
          'search-topic-aliases-selective-prefix',
          makePlan({ indexCond: '((alias)::text >= (lower($1))::text)' }),
        ),
      ),
    ).toThrow(/>= and </)

    expect(() =>
      assertTopicAliasPrefixCandidates(
        makeResult(
          'search-topic-aliases-selective-prefix',
          makePlan({ indexCond: '((alias >= lower($1)) AND (other_col < $2))' }),
        ),
      ),
    ).toThrow(/>= and </)

    expect(() =>
      assertTopicAliasPrefixCandidates(
        makeResult('search-topic-aliases-cursor', makePlan({ aliasRows: 26, topicRows: 26 })),
      ),
    ).toThrow(/> cursor/)

    expect(() =>
      assertTopicAliasPrefixCandidates(
        makeResult(
          'search-topic-aliases',
          makePlan({ aliasRows: 26, topicRows: 26, withSort: true }),
        ),
      ),
    ).toThrow(/no Sort/)
  })

  it('rejects excess alias rows or unindexed topic hydration', () => {
    expect(() =>
      assertTopicAliasPrefixCandidates(
        makeResult(
          'search-topic-aliases-selective-prefix',
          makePlan({ aliasRows: 31, topicRows: 11 }),
        ),
      ),
    ).toThrow(/at most 30 alias rows/)

    expect(() =>
      assertTopicAliasPrefixCandidates(
        makeResult('search-topic-aliases', makePlan({ aliasRows: 121, topicRows: 26 })),
      ),
    ).toThrow(/at most 120 alias rows/)

    expect(() =>
      assertTopicAliasPrefixCandidates(
        makeResult(
          'search-topic-aliases-selective-prefix',
          makePlan({ topicNodeType: 'Seq Scan', topicRows: 2500 }),
        ),
      ),
    ).toThrow(/topics_pkey/)
  })
})
