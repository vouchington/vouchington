import { describe, expect, it } from 'vitest'
import { streamIncompleteFollowerDistributionIdBatchesFromRows } from './backfill.mts'

describe('streamIncompleteFollowerDistributionIdBatches', () => {
  it('yields full and trailing batches', async () => {
    async function* rows() {
      for (let i = 0; i < 501; i += 1) {
        yield { id: `distribution-${i}` }
      }
    }

    const batches: string[][] = []
    for await (const batch of streamIncompleteFollowerDistributionIdBatchesFromRows(rows())) {
      batches.push(batch)
    }

    expect(batches).toHaveLength(2)
    expect(batches[0]).toHaveLength(500)
    expect(batches[1]).toEqual(['distribution-500'])
  })
})
