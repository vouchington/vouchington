import { describe, expect, it } from 'vitest'
import type { ExplainResult } from '@data-stores/psql'
import { assertEmbeddingReconciliationPlanIfApplicable } from './plan-embedding-reconciliation-gate.mts'

function result(scenarioId: string, plan: unknown): ExplainResult {
  return {
    name: scenarioId,
    scenario_id: scenarioId,
    query_text: 'SELECT id',
    plan,
    execution_time_ms: 1,
    planning_time_ms: 1,
    timestamp: new Date().toISOString(),
  }
}

const rssScan = {
  'Node Type': 'Index Only Scan',
  'Relation Name': 'rss_feed_items',
  'Index Name': 'idx_rss_feed_items__story_clustering_embedding_pending',
  'Index Cond': '(id > $1)',
  'Actual Rows': 100,
  'Actual Loops': 1,
}

describe('embedding reconciliation query plans', () => {
  it('requires the bounded RSS pending index and late cursor in both plan modes', () => {
    const valid = result('rss-story-embedding-pending-late-page', {
      Plan: { 'Node Type': 'Limit', Plans: [rssScan] },
    })
    expect(() => assertEmbeddingReconciliationPlanIfApplicable(valid)).not.toThrow()
    expect(() =>
      assertEmbeddingReconciliationPlanIfApplicable(
        result(valid.scenario_id!, {
          Plan: {
            'Node Type': 'Limit',
            Plans: [
              {
                ...rssScan,
                'Relation Name': 'rss_feed_items__p_current',
                'Index Name': 'rss_feed_items__p_current_id_idx1',
              },
            ],
          },
        }),
      ),
    ).not.toThrow()
    expect(() =>
      assertEmbeddingReconciliationPlanIfApplicable(
        result(valid.scenario_id!, {
          Plan: {
            'Node Type': 'Limit',
            Plans: [
              {
                ...rssScan,
                'Relation Name': 'rss_feed_items__p_current',
                'Index Name': 'rss_feed_items__p_current_id_idx1',
                'Actual Rows': 60,
              },
              {
                ...rssScan,
                'Relation Name': 'rss_feed_items_default',
                'Index Name': 'rss_feed_items_default_id_idx1',
                'Actual Rows': 41,
              },
            ],
          },
        }),
      ),
    ).toThrow(/at most 100/)
    expect(() =>
      assertEmbeddingReconciliationPlanIfApplicable(
        result(valid.scenario_id!, {
          Plan: {
            'Node Type': 'Limit',
            Plans: [
              {
                ...rssScan,
                'Relation Name': 'rss_feed_items_default',
                'Index Name': 'rss_feed_items_default_id_idx',
              },
            ],
          },
        }),
      ),
    ).toThrow(/must use/)
    for (const scan of [
      { ...rssScan, 'Index Name': 'rss_feed_items_pkey' },
      { ...rssScan, 'Index Cond': undefined },
      { ...rssScan, 'Actual Rows': 101 },
      { ...rssScan, 'Node Type': 'Seq Scan' },
    ]) {
      expect(() =>
        assertEmbeddingReconciliationPlanIfApplicable(
          result(valid.scenario_id!, {
            Plan: { 'Node Type': 'Limit', Plans: [scan] },
          }),
        ),
      ).toThrow(/must use/)
    }
  })

  it('requires the existing partial UUIDv7 first-post index without a sort', () => {
    const scan = {
      'Node Type': 'Index Only Scan',
      'Relation Name': 'posts',
      'Index Name': 'idx_posts__created_by_id__community_id__id',
    }
    const scenario = 'first-community-post-id-index'
    expect(() =>
      assertEmbeddingReconciliationPlanIfApplicable(result(scenario, { Plan: scan })),
    ).not.toThrow()
    expect(() =>
      assertEmbeddingReconciliationPlanIfApplicable(
        result(scenario, {
          Plan: {
            ...scan,
            'Relation Name': 'posts__default',
            'Index Name': 'posts__default_created_by_id_community_id_id_idx',
          },
        }),
      ),
    ).not.toThrow()
    expect(() =>
      assertEmbeddingReconciliationPlanIfApplicable(
        result(scenario, {
          Plan: { 'Node Type': 'Sort', Plans: [scan] },
        }),
      ),
    ).toThrow(/without a sort/)
  })
})
