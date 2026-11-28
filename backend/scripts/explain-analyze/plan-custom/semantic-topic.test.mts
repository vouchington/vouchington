import type { ExplainResult } from '@vouchington/explain-plan'
import { describe, expect, it } from 'vitest'
import { SEMANTIC_TOPIC_CANDIDATE_LIMIT } from '@services/topics/work-limits'
import { assertSemanticTopicSearchPlan } from './semantic-topic.mts'

function makeExplainResult(
  plans: Record<string, unknown>[],
  planCacheMode: 'force_custom_plan' | 'force_generic_plan' = 'force_custom_plan',
  scenarioId = 'topic-search-semantic-cursor',
): ExplainResult {
  return {
    name: `buildTopicSearchQuery:cursor:${planCacheMode}`,
    scenario_id: scenarioId,
    plan_cache_mode: planCacheMode,
    query_text: 'semantic topic fixture',
    plan: {
      Plan: {
        'Node Type': 'Limit',
        'Actual Rows': 11,
        'Actual Loops': 1,
        Plans: plans,
      },
    },
    execution_time_ms: 1,
    planning_time_ms: 0.1,
    timestamp: '2026-01-01T00:00:00.000Z',
  }
}

function makeBoundedNearestCte(actualRows = SEMANTIC_TOPIC_CANDIDATE_LIMIT, removedByFilter = 0) {
  return {
    'Node Type': 'Limit',
    'Subplan Name': 'CTE semantic_nearest',
    'Actual Rows': actualRows,
    'Actual Loops': 1,
    Plans: [
      {
        'Node Type': 'Index Scan',
        'Relation Name': 'topics',
        'Index Name': 'idx_topics__bedrock_nova_multimodal_v1_embedding',
        'Order By': '(bedrock_nova_multimodal_v1_embedding <=> $1)',
        'Actual Rows': actualRows,
        'Rows Removed by Filter': removedByFilter,
        'Actual Loops': 1,
      },
    ],
  }
}

function makeBoundedSimilarTopicNearestCte(
  actualRows = SEMANTIC_TOPIC_CANDIDATE_LIMIT,
  removedByFilter = 1,
) {
  return {
    'Node Type': 'Nested Loop',
    'Subplan Name': 'CTE semantic_nearest',
    'Actual Rows': actualRows,
    'Actual Loops': 1,
    Plans: [
      {
        'Node Type': 'Index Scan',
        'Relation Name': 'topics',
        'Index Name': 'topics_pkey',
        'Actual Rows': 1,
        'Actual Loops': 1,
      },
      {
        'Node Type': 'Limit',
        'Actual Rows': actualRows,
        'Actual Loops': 1,
        Plans: [
          {
            'Node Type': 'Index Scan',
            'Relation Name': 'topics',
            'Index Name': 'idx_topics__bedrock_nova_multimodal_v1_embedding',
            'Order By':
              '(bedrock_nova_multimodal_v1_embedding <=> topics.bedrock_nova_multimodal_v1_embedding)',
            'Actual Rows': actualRows,
            'Rows Removed by Filter': removedByFilter,
            'Actual Loops': 1,
          },
        ],
      },
    ],
  }
}

describe('assertSemanticTopicSearchPlan', () => {
  it.each(['force_custom_plan', 'force_generic_plan'] as const)(
    'passes a bounded HNSW semantic_nearest plan in %s',
    mode => {
      const result = makeExplainResult([makeBoundedNearestCte()], mode)
      expect(() => assertSemanticTopicSearchPlan(result)).not.toThrow()
    },
  )

  it.each(['force_custom_plan', 'force_generic_plan'] as const)(
    'rejects a sequential scan fallback on topics in %s',
    mode => {
      const seqFallback = makeExplainResult(
        [
          {
            'Node Type': 'Limit',
            'Subplan Name': 'CTE semantic_nearest',
            'Actual Rows': SEMANTIC_TOPIC_CANDIDATE_LIMIT,
            'Actual Loops': 1,
            Plans: [
              {
                'Node Type': 'Sort',
                Plans: [
                  {
                    'Node Type': 'Seq Scan',
                    'Relation Name': 'topics',
                    'Actual Rows': 40_000,
                    'Actual Loops': 1,
                  },
                ],
              },
            ],
          },
        ],
        mode,
      )
      expect(() => assertSemanticTopicSearchPlan(seqFallback)).toThrow(
        'must use the HNSW embedding index inside semantic_nearest',
      )
    },
  )

  it.each(['force_custom_plan', 'force_generic_plan'] as const)(
    'rejects unbounded rows processed on topics in %s',
    mode => {
      const unbounded = makeExplainResult(
        [makeBoundedNearestCte(SEMANTIC_TOPIC_CANDIDATE_LIMIT, 1)],
        mode,
      )
      expect(() => assertSemanticTopicSearchPlan(unbounded)).toThrow(
        `processed ${SEMANTIC_TOPIC_CANDIDATE_LIMIT + 1} rows from topics`,
      )
    },
  )

  it.each(['force_custom_plan', 'force_generic_plan'] as const)(
    'passes a bounded similar_topic_id HNSW plan (k + anchor rows) and rejects excess rows in %s',
    mode => {
      const bounded = makeExplainResult(
        [makeBoundedSimilarTopicNearestCte(SEMANTIC_TOPIC_CANDIDATE_LIMIT, 1)],
        mode,
        'topic-search-similar-topic',
      )
      expect(() => assertSemanticTopicSearchPlan(bounded)).not.toThrow()

      const unbounded = makeExplainResult(
        [makeBoundedSimilarTopicNearestCte(SEMANTIC_TOPIC_CANDIDATE_LIMIT, 2)],
        mode,
        'topic-search-similar-topic',
      )
      expect(() => assertSemanticTopicSearchPlan(unbounded)).toThrow(
        `processed ${SEMANTIC_TOPIC_CANDIDATE_LIMIT + 3} rows from topics; expected at most ${SEMANTIC_TOPIC_CANDIDATE_LIMIT + 2}`,
      )
    },
  )
})
