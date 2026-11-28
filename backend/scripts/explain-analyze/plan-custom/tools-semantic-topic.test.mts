import type { ExplainResult } from '@vouchington/explain-plan'
import { SEMANTIC_RSS_ITEM_CANDIDATE_LIMIT } from '@services/rss-feed-items/work-limits'
import { TOOLS_SEMANTIC_TOPIC_CANDIDATE_LIMIT } from '@services/topics/work-limits'
import { describe, expect, it } from 'vitest'
import { assertSemanticRssSearchPlan } from './semantic-rss.mts'
import { assertToolsSemanticTopicSearchPlan } from './tools-semantic-topic.mts'

function buildPlanResult(
  overrides: {
    scenarioId?: string
    planCacheMode?: 'force_custom_plan' | 'force_generic_plan'
    candidateNode?: Record<string, unknown>
    scanNode?: Record<string, unknown>
    extraPlanNodes?: Record<string, unknown>[]
  } = {},
): ExplainResult {
  const scanNode: Record<string, unknown> = {
    'Node Type': 'Index Scan',
    'Relation Name': 'topics',
    'Index Name': 'idx_topics__bedrock_nova_multimodal_v1_embedding',
    'Order By': '(bedrock_nova_multimodal_v1_embedding <=> ($1)::vector)',
    'Actual Rows': TOOLS_SEMANTIC_TOPIC_CANDIDATE_LIMIT,
    'Actual Loops': 1,
    ...overrides.scanNode,
  }
  const candidateNode: Record<string, unknown> = {
    'Node Type': 'Limit',
    'Subplan Name': 'CTE semantic_nearest',
    'Actual Rows': TOOLS_SEMANTIC_TOPIC_CANDIDATE_LIMIT,
    'Actual Loops': 1,
    Plans: [scanNode],
    ...overrides.candidateNode,
  }
  return {
    name: 'toolsSearchTopicsSemantic',
    scenario_id: overrides.scenarioId ?? 'tools-topic-search-semantic',
    plan_cache_mode: overrides.planCacheMode ?? 'force_generic_plan',
    query_text: 'SELECT id FROM semantic_nearest',
    execution_time_ms: 1.5,
    planning_time_ms: 0.2,
    timestamp: '2026-01-01T00:00:00.000Z',
    plan: {
      Plan: {
        'Node Type': 'Limit',
        'Actual Rows': 25,
        'Actual Loops': 1,
        Plans: [
          candidateNode,
          {
            'Node Type': 'Sort',
            'Actual Rows': 25,
            'Actual Loops': 1,
            Plans: [
              {
                'Node Type': 'CTE Scan',
                'CTE Name': 'semantic_nearest',
                'Actual Rows': TOOLS_SEMANTIC_TOPIC_CANDIDATE_LIMIT,
                'Actual Loops': 1,
              },
            ],
          },
          ...(overrides.extraPlanNodes ?? []),
        ],
      },
    },
  }
}

describe('tools semantic topic search plan gate', () => {
  it('accepts a bounded HNSW semantic_nearest plan in both custom and generic modes', () => {
    expect(() =>
      assertToolsSemanticTopicSearchPlan(buildPlanResult({ planCacheMode: 'force_custom_plan' })),
    ).not.toThrow()
    expect(() =>
      assertToolsSemanticTopicSearchPlan(buildPlanResult({ planCacheMode: 'force_generic_plan' })),
    ).not.toThrow()
  })

  it('ignores unrelated scenarios', () => {
    expect(() =>
      assertToolsSemanticTopicSearchPlan(
        buildPlanResult({
          scenarioId: 'topic-search-text',
          scanNode: { 'Node Type': 'Seq Scan', 'Actual Rows': 40_000 },
        }),
      ),
    ).not.toThrow()
  })

  it('rejects a missing or unbounded semantic_nearest Limit node', () => {
    expect(() =>
      assertToolsSemanticTopicSearchPlan(
        buildPlanResult({ candidateNode: { 'Subplan Name': 'CTE other' } }),
      ),
    ).toThrow('bounded semantic_nearest prefix')
    expect(() =>
      assertToolsSemanticTopicSearchPlan(
        buildPlanResult({ candidateNode: { 'Node Type': 'Sort' } }),
      ),
    ).toThrow('bounded semantic_nearest prefix')
    expect(() =>
      assertToolsSemanticTopicSearchPlan(
        buildPlanResult({
          candidateNode: { 'Actual Rows': TOOLS_SEMANTIC_TOPIC_CANDIDATE_LIMIT + 1 },
        }),
      ),
    ).toThrow('bounded semantic_nearest prefix')
  })

  it('rejects plans that drop the HNSW index scan or fall back to seq/bitmap scans', () => {
    expect(() =>
      assertToolsSemanticTopicSearchPlan(
        buildPlanResult({ scanNode: { 'Index Name': 'topics_pkey', 'Order By': undefined } }),
      ),
    ).toThrow('HNSW embedding index inside semantic_nearest')
    expect(() =>
      assertToolsSemanticTopicSearchPlan(
        buildPlanResult({
          extraPlanNodes: [
            {
              'Node Type': 'Seq Scan',
              'Relation Name': 'topics',
              'Actual Rows': 40_000,
              'Actual Loops': 1,
            },
          ],
        }),
      ),
    ).toThrow('seq or bitmap scan on topics')
    expect(() =>
      assertToolsSemanticTopicSearchPlan(
        buildPlanResult({
          extraPlanNodes: [
            {
              'Node Type': 'Bitmap Heap Scan',
              'Relation Name': 'topics',
              'Actual Rows': 10,
              'Actual Loops': 1,
            },
          ],
        }),
      ),
    ).toThrow('seq or bitmap scan on topics')
  })

  it('rejects excess processed rows on topics including filtered rows and loops', () => {
    expect(() =>
      assertToolsSemanticTopicSearchPlan(
        buildPlanResult({
          scanNode: {
            'Actual Rows': TOOLS_SEMANTIC_TOPIC_CANDIDATE_LIMIT,
            'Rows Removed by Filter': 1,
          },
        }),
      ),
    ).toThrow(`processed ${TOOLS_SEMANTIC_TOPIC_CANDIDATE_LIMIT + 1} rows from topics`)
    expect(() =>
      assertToolsSemanticTopicSearchPlan(
        buildPlanResult({
          scanNode: {
            'Actual Rows': Math.ceil(TOOLS_SEMANTIC_TOPIC_CANDIDATE_LIMIT / 2) + 1,
            'Actual Loops': 2,
          },
        }),
      ),
    ).toThrow('rows from topics')
  })

  it('delegates semantic RSS plan validation through the shared semantic_nearest gate', () => {
    const validRss = buildPlanResult({
      scenarioId: 'rss-feed-items-search-semantic-cursor',
      candidateNode: { 'Actual Rows': SEMANTIC_RSS_ITEM_CANDIDATE_LIMIT },
      scanNode: {
        'Relation Name': 'rss_feed_items',
        'Index Name': 'idx_rss_feed_items__bedrock_nova_multimodal_v1_embedding',
        'Actual Rows': SEMANTIC_RSS_ITEM_CANDIDATE_LIMIT,
      },
    })
    expect(() => assertSemanticRssSearchPlan(validRss)).not.toThrow()
    expect(() =>
      assertSemanticRssSearchPlan(
        buildPlanResult({
          scenarioId: 'rss-feed-items-search-semantic-cursor',
          candidateNode: { 'Actual Rows': SEMANTIC_RSS_ITEM_CANDIDATE_LIMIT },
          scanNode: {
            'Relation Name': 'rss_feed_items',
            'Index Name': 'idx_rss_feed_items__bedrock_nova_multimodal_v1_embedding',
            'Actual Rows': SEMANTIC_RSS_ITEM_CANDIDATE_LIMIT + 1,
          },
        }),
      ),
    ).toThrow(`processed ${SEMANTIC_RSS_ITEM_CANDIDATE_LIMIT + 1} rows from rss_feed_items`)
  })
})
