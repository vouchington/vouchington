import { it, expect, describe } from 'vitest'
import { getEntityRelationElectionsByIdBatch } from './get-election-batch.mts'

describe('get-election-batch', () => {
  it('getEntityRelationElectionsByIdBatch returns empty array for empty input', async () => {
    const results = await getEntityRelationElectionsByIdBatch([])
    expect(results).toEqual([])
  })

  it('getEntityRelationElectionsByIdBatch returns null for non-existent elections while preserving order', async () => {
    const results = await getEntityRelationElectionsByIdBatch([
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
    ])

    expect(results).toHaveLength(2)
    expect(results[0]).toBeNull()
    expect(results[1]).toBeNull()
  })

  it('getEntityRelationElectionsByIdBatch throws for invalid IDs', async () => {
    await expect(getEntityRelationElectionsByIdBatch(['invalid-id'])).rejects.toThrow(
      'Invalid entity relation ID',
    )
  })
})
