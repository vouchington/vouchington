import { describe, expect, it } from 'vitest'
import { databaseUrlWithName } from '../../backend/scripts/explain-analyze/benchmarks/topic-metrics/database-lifecycle.mts'
import { effectiveRows } from '../../backend/scripts/explain-analyze/benchmarks/topic-metrics/sampling.mts'

describe('topic metrics benchmark safety helpers', () => {
  it('removes a libpq dbname override when targeting the sibling database', () => {
    expect(
      databaseUrlWithName(
        'postgresql://localhost/default?dbname=voucha-source&sslmode=disable',
        'voucha-topic-metrics-candidate',
      ),
    ).toBe('postgresql://localhost/voucha-topic-metrics-candidate?sslmode=disable')
  })

  it('counts emitted and filtered rows across scan loops', () => {
    expect(
      effectiveRows({
        'Node Type': 'Bitmap Heap Scan',
        'Actual Rows': 100,
        'Actual Loops': 2,
        'Rows Removed by Filter': 900,
        'Rows Removed by Index Recheck': 50,
      }),
    ).toBe(2_100)
  })
})
