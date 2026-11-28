import { describe, expect, it } from 'vitest'
import type { ExplainResult, PlanNode } from '@vouchington/explain-plan'
import { assertTopicAliasPrefixCandidates } from './topic-alias-prefix.mts'

function makePlan({
  indexName = 'idx_topic_aliases__alias__text_pattern_ops',
  indexCond = '((alias ~>=~ search_input.prefix) AND (alias ~<~ search_input.upper_prefix))',
  aliasRows = 11,
  topicRows = 11,
  topicIndex = 'topics_pkey',
  topicNodeType = 'Index Scan',
}: {
  indexName?: string
  indexCond?: string
  aliasRows?: number
  topicRows?: number
  topicIndex?: string
  topicNodeType?: string
} = {}): PlanNode {
  return {
    'Node Type': 'Limit',
    'Actual Rows': Math.min(aliasRows, topicRows),
    'Actual Loops': 1,
    Plans: [
      {
        'Node Type': 'Nested Loop',
        'Actual Rows': Math.min(aliasRows, topicRows),
        'Actual Loops': 1,
        Plans: [
          {
            'Node Type': 'Sort',
            'Actual Rows': aliasRows,
            'Actual Loops': 1,
            Plans: [
              {
                'Node Type': 'Bitmap Heap Scan',
                'Relation Name': 'topic_aliases',
                'Actual Rows': aliasRows,
                'Actual Loops': 1,
                Plans: [
                  {
                    'Node Type': 'Bitmap Index Scan',
                    'Index Name': indexName,
                    'Index Cond': indexCond,
                    'Actual Rows': aliasRows,
                    'Actual Loops': 1,
                  },
                ],
              },
            ],
          },
          {
            'Node Type': topicNodeType,
            'Relation Name': 'topics',
            ...(topicNodeType === 'Index Scan' ? { 'Index Name': topicIndex } : {}),
            'Actual Rows': 1,
            'Actual Loops': topicRows,
          },
        ],
      },
    ],
  }
}

function makeResult(scenarioId: string, plan: PlanNode): ExplainResult {
  return {
    name: `searchTopicAliases:force_generic_plan`,
    scenario_id: scenarioId,
    query_text: '/* searchTopicAliases */ SELECT 1',
    plan,
    execution_time_ms: 0.1,
    planning_time_ms: 0.1,
    plan_cache_mode: 'force_generic_plan',
    timestamp: '2026-11-28T00:00:00.000Z',
  }
}

describe('assertTopicAliasPrefixCandidates', () => {
  it('accepts selective and broad plans backed by idx_topic_aliases__alias__text_pattern_ops', () => {
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
        makeResult('search-topic-aliases', makePlan({ aliasRows: 2500, topicRows: 26 })),
      ),
    ).not.toThrow()
  })

  it('rejects a walk of topic_aliases_alias_key instead of the text_pattern_ops index', () => {
    expect(() =>
      assertTopicAliasPrefixCandidates(
        makeResult(
          'search-topic-aliases-selective-prefix',
          makePlan({ indexName: 'topic_aliases_alias_key', indexCond: '' }),
        ),
      ),
    ).toThrow(/idx_topic_aliases__alias__text_pattern_ops/)
  })

  it('rejects a prefix index scan missing the ~<~ upper bound', () => {
    expect(() =>
      assertTopicAliasPrefixCandidates(
        makeResult(
          'search-topic-aliases-selective-prefix',
          makePlan({ indexCond: '(alias ~>=~ search_input.prefix)' }),
        ),
      ),
    ).toThrow(/~<~/)
  })

  it('rejects excess alias rows or unindexed topic hydration', () => {
    expect(() =>
      assertTopicAliasPrefixCandidates(
        makeResult(
          'search-topic-aliases-selective-prefix',
          makePlan({ aliasRows: 31, topicRows: 11 }),
        ),
      ),
    ).toThrow(/at most 30 alias candidates/)

    expect(() =>
      assertTopicAliasPrefixCandidates(
        makeResult('search-topic-aliases', makePlan({ aliasRows: 2500, topicRows: 41 })),
      ),
    ).toThrow(/at most 40 keyed topics/)

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
