import { describe, expect, it } from 'vitest'
import { getPartitionStatus } from './partitions.mts'

describe('getPartitionStatus', () => {
  it('returns result with tables array', async () => {
    const result = await getPartitionStatus()
    expect(result).toHaveProperty('tables')
    expect(Array.isArray(result.tables)).toBe(true)
  })

  it('returns at least one partitioned table', async () => {
    const result = await getPartitionStatus()
    expect(result.tables.length).toBeGreaterThan(0)
  })

  it('each table has correct shape', async () => {
    const result = await getPartitionStatus()
    for (const table of result.tables) {
      expect(typeof table.name).toBe('string')
      expect(typeof table.partition_count).toBe('number')
      expect(typeof table.total_size_bytes).toBe('number')
      expect(Array.isArray(table.partitions)).toBe(true)
      for (const partition of table.partitions) {
        expect(typeof partition.name).toBe('string')
        expect(typeof partition.size_bytes).toBe('number')
      }
    }
  })

  it('partition_count matches partitions array length', async () => {
    const result = await getPartitionStatus()
    for (const table of result.tables) {
      expect(table.partition_count).toBe(table.partitions.length)
    }
  })

  it('total_size_bytes equals sum of partition size_bytes', async () => {
    const result = await getPartitionStatus()
    for (const table of result.tables) {
      const sum = table.partitions.reduce((acc, p) => acc + p.size_bytes, 0)
      expect(table.total_size_bytes).toBe(sum)
    }
  })
})
