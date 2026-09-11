import { describe, expect, it } from 'vitest'
import { analyzeResult } from './plan-warnings.mts'
import type { ExplainResult } from '@data-stores/psql'

function makeResult(plan: unknown, opts?: Partial<ExplainResult>): ExplainResult {
  return {
    name: 'test',
    query_text: 'SELECT 1',
    plan,
    execution_time_ms: opts?.execution_time_ms ?? 1,
    planning_time_ms: opts?.planning_time_ms ?? 0,
    timestamp: new Date().toISOString(),
    ...opts,
  }
}

describe('analyzeResult', () => {
  it('flags seq scan on a large table', () => {
    const plan = {
      Plan: {
        'Node Type': 'Seq Scan',
        'Relation Name': 'posts',
        'Actual Rows': 1000,
        'Plan Rows': 500,
        'Total Cost': 100,
      },
    }
    const { seqScans } = analyzeResult(makeResult(plan))
    expect(seqScans).toHaveLength(1)
    expect(seqScans[0].relationName).toBe('posts')
    expect(seqScans[0].actualRows).toBe(1000)
    expect(seqScans[0].scannedRows).toBe(1000)
  })

  it('reports filtered seq scans by rows scanned instead of rows output', () => {
    const plan = {
      Plan: {
        'Node Type': 'Seq Scan',
        'Relation Name': 'posts',
        'Actual Rows': 0,
        'Actual Loops': 2,
        'Rows Removed by Filter': 500,
        'Plan Rows': 1,
        'Total Cost': 100,
      },
    }
    const { seqScans } = analyzeResult(makeResult(plan))
    expect(seqScans).toEqual([{ relationName: 'posts', actualRows: 0, scannedRows: 1000 }])
  })

  it('rounds parallel seq scan worker averages to integer row counts', () => {
    const plan = {
      Plan: {
        'Node Type': 'Seq Scan',
        'Relation Name': 'posts',
        'Actual Rows': 333_333.33,
        'Actual Loops': 3,
        'Rows Removed by Filter': 10.33,
        'Plan Rows': 1_000_000,
        'Total Cost': 100,
      },
    }
    const { seqScans } = analyzeResult(makeResult(plan))
    expect(seqScans).toEqual([
      { relationName: 'posts', actualRows: 1_000_000, scannedRows: 1_000_031 },
    ])
  })

  it('does not flag empty partition seq scans that visit no rows', () => {
    const plan = {
      Plan: {
        'Node Type': 'Seq Scan',
        'Relation Name': 'posts__default',
        'Actual Rows': 0,
        'Actual Loops': 1,
        'Rows Removed by Filter': 0,
        'Plan Rows': 100,
        'Total Cost': 100,
      },
    }
    const { seqScans } = analyzeResult(makeResult(plan))
    expect(seqScans).toHaveLength(0)
  })

  it('does not flag never-executed seq scans with zero loops', () => {
    const plan = {
      Plan: {
        'Node Type': 'Seq Scan',
        'Relation Name': 'posts',
        'Actual Rows': 0,
        'Actual Loops': 0,
        'Rows Removed by Filter': 0,
        'Plan Rows': 100,
        'Total Cost': 100,
      },
    }
    const { seqScans } = analyzeResult(makeResult(plan))
    expect(seqScans).toHaveLength(0)
  })

  it('does not flag seq scan on a small table', () => {
    const plan = {
      Plan: {
        'Node Type': 'Seq Scan',
        'Relation Name': 'small_config_table',
        'Actual Rows': 5,
        'Plan Rows': 5,
        'Total Cost': 1,
      },
    }
    const { seqScans } = analyzeResult(makeResult(plan))
    expect(seqScans).toHaveLength(0)
  })

  it('flags estimate mismatches with ratio > 10', () => {
    const plan = {
      Plan: {
        'Node Type': 'Index Scan',
        'Relation Name': 'posts',
        'Actual Rows': 1000,
        'Plan Rows': 1,
        'Total Cost': 50,
      },
    }
    const { estimateMismatches } = analyzeResult(makeResult(plan))
    expect(estimateMismatches).toHaveLength(1)
    expect(estimateMismatches[0].ratio).toBe(1000)
  })

  it('does not flag estimate mismatches with ratio <= 10', () => {
    const plan = {
      Plan: {
        'Node Type': 'Index Scan',
        'Actual Rows': 10,
        'Plan Rows': 5,
        'Total Cost': 50,
      },
    }
    const { estimateMismatches } = analyzeResult(makeResult(plan))
    expect(estimateMismatches).toHaveLength(0)
  })

  it('returns costliest node', () => {
    const plan = {
      Plan: {
        'Node Type': 'Hash Join',
        'Actual Rows': 100,
        'Plan Rows': 100,
        'Total Cost': 999,
        Plans: [
          {
            'Node Type': 'Seq Scan',
            'Relation Name': 'small_config_table',
            'Actual Rows': 10,
            'Plan Rows': 10,
            'Total Cost': 1,
          },
        ],
      },
    }
    const { costliestNode } = analyzeResult(makeResult(plan))
    expect(costliestNode?.nodeType).toBe('Hash Join')
    expect(costliestNode?.cost).toBe(999)
  })

  it('flags Append nodes with more than 2 children', () => {
    const plan = {
      Plan: {
        'Node Type': 'Append',
        'Actual Rows': 30,
        'Plan Rows': 30,
        'Total Cost': 10,
        Plans: [
          { 'Node Type': 'Seq Scan', 'Actual Rows': 10, 'Plan Rows': 10, 'Total Cost': 3 },
          { 'Node Type': 'Seq Scan', 'Actual Rows': 10, 'Plan Rows': 10, 'Total Cost': 3 },
          { 'Node Type': 'Seq Scan', 'Actual Rows': 10, 'Plan Rows': 10, 'Total Cost': 3 },
        ],
      },
    }
    const { appendOverhead } = analyzeResult(makeResult(plan))
    expect(appendOverhead).toHaveLength(1)
    expect(appendOverhead[0].childCount).toBe(3)
  })

  it('does not flag Append nodes with 2 or fewer children', () => {
    const plan = {
      Plan: {
        'Node Type': 'Append',
        'Actual Rows': 20,
        'Plan Rows': 20,
        'Total Cost': 6,
        Plans: [
          { 'Node Type': 'Seq Scan', 'Actual Rows': 10, 'Plan Rows': 10, 'Total Cost': 3 },
          { 'Node Type': 'Seq Scan', 'Actual Rows': 10, 'Plan Rows': 10, 'Total Cost': 3 },
        ],
      },
    }
    const { appendOverhead } = analyzeResult(makeResult(plan))
    expect(appendOverhead).toHaveLength(0)
  })

  it('flags high shared buffer usage', () => {
    const plan = {
      Plan: {
        'Node Type': 'Aggregate',
        'Actual Rows': 1,
        'Plan Rows': 1,
        'Total Cost': 100,
        'Shared Hit Blocks': 12_000,
        'Shared Read Blocks': 10,
        'Shared Dirtied Blocks': 5000,
        'Shared Written Blocks': 1000,
        Plans: [
          {
            'Node Type': 'Index Only Scan',
            'Relation Name': 'posts',
            'Actual Rows': 1000,
            'Plan Rows': 1000,
            'Total Cost': 90,
            'Shared Hit Blocks': 10_900,
            'Shared Read Blocks': 100,
            'Shared Dirtied Blocks': 5000,
            'Shared Written Blocks': 1000,
          },
        ],
      },
    }
    const { highSharedBuffers } = analyzeResult(makeResult(plan))
    expect(highSharedBuffers).toHaveLength(1)
    expect(highSharedBuffers[0].nodeType).toBe('Index Only Scan')
    expect(highSharedBuffers[0].relationName).toBe('posts')
    expect(highSharedBuffers[0].sharedBlocks).toBe(11_000)
  })

  it('does not flag low shared buffer usage', () => {
    const plan = {
      Plan: {
        'Node Type': 'Index Scan',
        'Relation Name': 'posts',
        'Actual Rows': 100,
        'Plan Rows': 100,
        'Total Cost': 20,
        'Shared Hit Blocks': 9999,
      },
    }
    const { highSharedBuffers } = analyzeResult(makeResult(plan))
    expect(highSharedBuffers).toHaveLength(0)
  })

  it('flags temp I/O, disk sorts, multi-batch hashes, and excessive WAL', () => {
    const plan = {
      Plan: {
        'Node Type': 'Sort',
        'Temp Written Blocks': 2,
        'Sort Space Type': 'Disk',
        'Hash Batches': 4,
        'WAL Bytes': 11 * 1024 * 1024,
      },
    }

    expect(analyzeResult(makeResult(plan)).resourcePressure).toHaveLength(1)
  })

  it('ignores invalid plan objects', () => {
    const warnings = analyzeResult(makeResult(null))

    expect(warnings.seqScans).toHaveLength(0)
    expect(warnings.estimateMismatches).toHaveLength(0)
    expect(warnings.costliestNode).toBeUndefined()
    expect(warnings.appendOverhead).toHaveLength(0)
    expect(warnings.highSharedBuffers).toHaveLength(0)
    expect(warnings.resourcePressure).toHaveLength(0)
  })
})
