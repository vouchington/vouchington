import { analyzeResult, type ExplainResult } from '@vouchington/explain-plan'
import { describe, expect, it } from 'vitest'
import { PLAN_ANALYSIS_OPTIONS } from './plan-analysis-options.mts'

function seqScan(relationName: string): ExplainResult {
  return {
    name: 'test',
    // ast-grep-ignore: no-sql-in-backend-tests -- synthetic ExplainResult fixture for plan-analysis unit test
    query_text: 'SELECT 1',
    plan: {
      Plan: { 'Node Type': 'Seq Scan', 'Relation Name': relationName, 'Actual Rows': 10 },
    },
    execution_time_ms: 1,
    planning_time_ms: 0,
    timestamp: new Date().toISOString(),
  }
}

describe('PLAN_ANALYSIS_OPTIONS', () => {
  it('flags sequential scans of large-table partitions and ignores small tables', () => {
    for (const relation of ['posts', 'posts__default', 'posts__p_2026_01']) {
      expect(analyzeResult(seqScan(relation), PLAN_ANALYSIS_OPTIONS).seqScans).toHaveLength(1)
    }
    expect(analyzeResult(seqScan('categories'), PLAN_ANALYSIS_OPTIONS).seqScans).toEqual([])
  })
})
