import { describe, expect, it, vi } from 'vitest'
import type {
  EntityReconciliationDispatchData,
  ReconcileEntityData,
} from '@queues/entity-listeners/types'
import { reconcileEntityBatches } from './reconciliation-batches.mts'
import { processReconciliationJob } from './process-reconciliation-job.mts'

describe('reconciliation sweep ownership', () => {
  it('saves successful progress without masking the original side-effect failure', async () => {
    const window = {
      start: '2026-07-17T00:00:00.000Z',
      end: '2026-07-17T00:01:00.000Z',
    }
    const first: ReconcileEntityData = {
      entityType: 'user',
      entityId: 'a',
      changedAtEpochUs: '1',
    }
    const failure = new Error('side effect failed')
    const updateData = vi.fn<(data: EntityReconciliationDispatchData) => Promise<void>>(
      async () => {},
    )
    const moveToDelayed = vi.fn<(timestamp: number) => Promise<never>>(async () => {
      throw new Error('unexpected delay')
    })
    await expect(
      processReconciliationJob({ data: {}, updateData, moveToDelayed }, async (_, save) => {
        await save({ window })
        return reconcileEntityBatches(
          twoBatches(first),
          async candidate => {
            if (candidate.entityId === 'b') throw failure
          },
          {
            hasMore: () => false,
            onMore: after => save({ window, after }),
          },
        )
      }),
    ).rejects.toBe(failure)
    expect(updateData.mock.calls).toEqual([[{ window }], [{ window, after: first }]])
    expect(moveToDelayed).not.toHaveBeenCalled()
  })
})

async function* twoBatches(first: ReconcileEntityData) {
  yield [first, { ...first, entityId: 'b' }]
}
