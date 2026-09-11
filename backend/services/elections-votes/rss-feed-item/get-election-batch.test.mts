import { it, expect, describe } from 'vitest'
import { getRssFeedItemElectionsByIdBatch } from './get-election-batch.mts'

describe('get-election-batch', () => {
  it('getRssFeedItemElectionsByIdBatch returns empty array for empty input', async () => {
    const results = await getRssFeedItemElectionsByIdBatch([])
    expect(results).toEqual([])
  })

  it('getRssFeedItemElectionsByIdBatch returns null for non-existent elections while preserving order', async () => {
    const results = await getRssFeedItemElectionsByIdBatch([
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
    ])

    expect(results).toHaveLength(2)
    expect(results[0]).toBeNull()
    expect(results[1]).toBeNull()
  })

  it('getRssFeedItemElectionsByIdBatch throws for invalid IDs', async () => {
    await expect(getRssFeedItemElectionsByIdBatch(['invalid-id'])).rejects.toThrow('Invalid ID')
  })
})
