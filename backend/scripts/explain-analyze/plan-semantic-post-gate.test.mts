import { describe, expect, it } from 'vitest'
import type { ExplainResult } from '@data-stores/psql'
import { assertSemanticPostCandidatePlan } from './plan-semantic-post-gate.mts'

function result(candidateScan = 'Index Scan', outerScan = 'Index Scan'): ExplainResult {
  return {
    name: 'semantic-window',
    scenario_id: 'post-search-hybrid-relevance',
    query_text: 'SELECT bounded candidates',
    plan_cache_mode: 'force_custom_plan',
    execution_time_ms: 1,
    planning_time_ms: 1,
    timestamp: new Date().toISOString(),
    plan: {
      Plan: {
        'Node Type': 'Limit',
        Plans: [
          {
            'Node Type': 'Limit',
            'Subplan Name': 'CTE semantic_post_candidates',
            'Actual Rows': 1000,
            Plans: [
              {
                'Node Type': candidateScan,
                'Relation Name': 'posts__default',
                'Order By': 'bedrock_nova_multimodal_v1_embedding <=> $1',
              },
            ],
          },
          {
            'Node Type': outerScan,
            'Relation Name': 'posts__default',
            'Index Cond': 'id = semantic_post_candidates.id',
          },
        ],
      },
    },
  }
}

describe('semantic post candidate plan gate', () => {
  it('accepts a vector-index window with indexed outer post lookups', () => {
    expect(() => assertSemanticPostCandidatePlan(result())).not.toThrow()
  })

  it('rejects candidate scans that cannot bound vector distance work through HNSW', () => {
    expect(() => assertSemanticPostCandidatePlan(result('Seq Scan'))).toThrow(
      'distance-ordered vector index',
    )
  })

  it('rejects full outer post scans even after selecting indexed candidates', () => {
    for (const scan of ['Seq Scan', 'Bitmap Heap Scan']) {
      expect(() => assertSemanticPostCandidatePlan(result('Index Scan', scan))).toThrow(
        'look up outer posts from the bounded candidates',
      )
    }
  })

  it('measures generic candidate plans while still rejecting their unbounded outer scans', () => {
    const generic = { ...result('Seq Scan'), plan_cache_mode: 'force_generic_plan' as const }
    expect(() => assertSemanticPostCandidatePlan(generic)).not.toThrow()
    expect(() =>
      assertSemanticPostCandidatePlan({
        ...result('Index Scan', 'Seq Scan'),
        plan_cache_mode: 'force_generic_plan',
      }),
    ).toThrow('look up outer posts from the bounded candidates')
  })
})
