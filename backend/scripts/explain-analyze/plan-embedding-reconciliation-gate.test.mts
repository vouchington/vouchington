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

describe('embedding reconciliation query plans', () => {
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
