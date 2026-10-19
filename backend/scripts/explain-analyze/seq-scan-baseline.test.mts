import { describe, expect, it } from 'vitest'
import type { ExplainResult } from '@data-stores/psql'
import { getResampleRelations } from './seq-scan-baseline.mts'

function result(name: string, plans: readonly Record<string, unknown>[]): ExplainResult {
  return {
    name,
    scenario_id: 'feed',
    capture_index: 0,
    plan_cache_mode: 'force_custom_plan',
    query_text: 'SELECT 1',
    plan: {
      Plan: { 'Node Type': 'Nested Loop', 'Actual Rows': 1, 'Actual Loops': 1, Plans: plans },
    },
    execution_time_ms: 1,
    planning_time_ms: 1,
    timestamp: '2026-10-19T00:00:00.000Z',
  }
}

function scan(nodeType: string, relation: string, actualRows = 1) {
  return {
    'Node Type': nodeType,
    'Relation Name': relation,
    'Actual Rows': actualRows,
    'Actual Loops': 1,
  }
}

describe('getResampleRelations', () => {
  it('re-samples scanned large parents but not large relations read through an index', () => {
    const results = [
      result('feed', [scan('Seq Scan', 'crawls__p_2026_10'), scan('Index Scan', 'posts__default')]),
      result('authors', [scan('Seq Scan', 'users'), scan('Seq Scan', 'small_config_table')]),
    ]
    expect(getResampleRelations(results, {})).toEqual(['crawls', 'users'])
  })

  it('skips a sequential scan that visited no rows', () => {
    expect(
      getResampleRelations([result('feed', [scan('Seq Scan', 'posts__default', 0)])], {}),
    ).toEqual([])
  })

  it('re-samples a baselined relation the first pass did not scan', () => {
    const results = [result('feed', [scan('Index Scan', 'posts__default')])]
    const baseline = { 'feed|0|feed|force_custom_plan': ['posts'], 'other|0|x|auto': ['topics'] }
    expect(getResampleRelations(results, baseline)).toEqual(['posts'])
  })
})
