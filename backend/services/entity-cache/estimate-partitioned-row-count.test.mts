import { describe, expect, it } from 'vitest'
import { estimatePartitionedRowCount } from './estimate-partitioned-row-count.mts'

describe('estimatePartitionedRowCount', () => {
  it.each(['posts', 'rss_feed_items'] as const)(
    'returns a non-negative finite estimate for %s',
    async table => {
      const estimate = await estimatePartitionedRowCount(table)

      expect(Number.isFinite(estimate)).toBe(true)
      expect(estimate).toBeGreaterThanOrEqual(0)
    },
  )
})
