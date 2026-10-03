import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_BATCH_SIZE } from '../cleanup-batches.mts'
import { runBoundedBatches } from '../run-bounded-batches.mts'

function createDeleteBatch(...deletedPerBatch: number[]) {
  const deleteBatch = vi.fn<(batchSize: number) => Promise<number>>()
  for (const deleted of deletedPerBatch) deleteBatch.mockResolvedValueOnce(deleted)
  return deleteBatch
}

describe('runBoundedBatches', () => {
  it('keeps deleting while batches are full and stops after the first partial batch', async () => {
    const deleteBatch = createDeleteBatch(3, 3, 2, 3)

    await expect(runBoundedBatches({ batchSize: 3, maxBatches: 10 }, deleteBatch)).resolves.toEqual(
      { deleted: 8, hasMore: false },
    )
    expect(deleteBatch.mock.calls).toEqual([[3], [3], [3]])
  })

  it('reports hasMore when maxBatches stops a run of full batches', async () => {
    const deleteBatch = createDeleteBatch(2, 2, 2)

    await expect(runBoundedBatches({ batchSize: 2, maxBatches: 2 }, deleteBatch)).resolves.toEqual({
      deleted: 4,
      hasMore: true,
    })
    expect(deleteBatch.mock.calls).toEqual([[2], [2]])
  })

  it('stops after one empty batch requested at the default batch size', async () => {
    const deleteBatch = createDeleteBatch(0, DEFAULT_BATCH_SIZE)

    await expect(runBoundedBatches({ maxBatches: 5 }, deleteBatch)).resolves.toEqual({
      deleted: 0,
      hasMore: false,
    })
    expect(deleteBatch.mock.calls).toEqual([[DEFAULT_BATCH_SIZE]])
  })

  it('rejects invalid limits before deleting anything', async () => {
    const deleteBatch = createDeleteBatch(1)

    await expect(runBoundedBatches({ batchSize: 0, maxBatches: 1 }, deleteBatch)).rejects.toThrow(
      'batchSize must be a positive integer',
    )
    for (const maxBatches of [1.5, 0, -1, Infinity, Number.NaN]) {
      await expect(runBoundedBatches({ maxBatches }, deleteBatch)).rejects.toThrow(
        'maxBatches must be a positive integer',
      )
    }
    expect(deleteBatch).not.toHaveBeenCalled()
  })

  it('requires a per-run cap at the type level and at runtime', async () => {
    const deleteBatch = createDeleteBatch(1)

    // @ts-expect-error maxBatches is required; an uncapped loop is a type error
    const uncapped = runBoundedBatches({ batchSize: 1 }, deleteBatch)

    await expect(uncapped).rejects.toThrow('maxBatches must be a positive integer')
    expect(deleteBatch).not.toHaveBeenCalled()
  })
})
