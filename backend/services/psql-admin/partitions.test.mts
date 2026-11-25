import { describe, expect, it } from 'vitest'
import { getPartitionStatus } from './partitions.mts'

describe('getPartitionStatus', () => {
  it('returns partitioned tables with Voucha drop-refusal policy wired', async () => {
    const result = await getPartitionStatus()
    expect(result.tables.length).toBeGreaterThan(0)
    for (const table of result.tables) {
      expect(typeof table.name).toBe('string')
      for (const partition of table.partitions) {
        expect(typeof partition.name).toBe('string')
        expect(partition.drop_refusal === null || typeof partition.drop_refusal === 'string').toBe(
          true,
        )
      }
    }
  })
})
