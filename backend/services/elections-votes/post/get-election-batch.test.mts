import { it, expect, describe } from 'vitest'
import { getPostElectionsByIdBatch } from './get-election-batch.mts'

describe('get-election-batch', () => {
  it('getPostElectionsByIdBatch returns empty array for empty input', async () => {
    const results = await getPostElectionsByIdBatch([])
    expect(results).toEqual([])
  })

  it('getPostElectionsByIdBatch returns null for non-existent elections while preserving order', async () => {
    const results = await getPostElectionsByIdBatch([
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
    ])

    expect(results).toHaveLength(2)
    expect(results[0]).toBeNull()
    expect(results[1]).toBeNull()
  })

  it('getPostElectionsByIdBatch throws for invalid IDs', async () => {
    await expect(getPostElectionsByIdBatch(['invalid-id'])).rejects.toThrow('Invalid ID')
  })
})
