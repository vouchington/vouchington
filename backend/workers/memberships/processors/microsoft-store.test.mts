import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type {
  advanceMicrosoftStoreSourceRecoveryCursor,
  findRecoverableMicrosoftStoreSourceJobs,
  MicrosoftStoreSourceRecoveryBatch,
} from '@services/memberships/microsoft'
import type {
  enqueueContinueRecoverMicrosoftStoreSources,
  enqueueReconcileMicrosoftStoreSource,
} from '@queues/memberships/enqueues'
import { recoverMicrosoftStoreSources } from './microsoft-store.mts'

describe('recoverMicrosoftStoreSources', () => {
  it('chains a continuation only after the CAS-owning full page advances', async () => {
    const batch = makeBatch({ completesSweep: false })
    const enqueueContinuation = vi.fn<typeof enqueueContinueRecoverMicrosoftStoreSources>()
    const enqueueSource = vi.fn<typeof enqueueReconcileMicrosoftStoreSource>()
    const advance = vi
      .fn<typeof advanceMicrosoftStoreSourceRecoveryCursor>()
      .mockResolvedValue(true)
    const find = vi.fn<typeof findRecoverableMicrosoftStoreSourceJobs>().mockResolvedValue(batch)

    await recoverMicrosoftStoreSources({
      advanceMicrosoftStoreSourceRecoveryCursor: advance,
      enqueueContinueRecoverMicrosoftStoreSources: enqueueContinuation,
      enqueueReconcileMicrosoftStoreSource: enqueueSource,
      findRecoverableMicrosoftStoreSourceJobs: find,
    })

    expect(enqueueSource).toHaveBeenCalledWith({ sourceId: batch.sourceIds[0] })
    expect(advance).toHaveBeenCalledWith(batch)
    expect(enqueueContinuation).toHaveBeenCalledOnce()
  })

  it('does not chain a completed or stale page', async () => {
    const enqueueContinuation = vi.fn<typeof enqueueContinueRecoverMicrosoftStoreSources>()
    const enqueueSource = vi.fn<typeof enqueueReconcileMicrosoftStoreSource>()
    const advance = vi
      .fn<typeof advanceMicrosoftStoreSourceRecoveryCursor>()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
    const find = vi
      .fn<typeof findRecoverableMicrosoftStoreSourceJobs>()
      .mockResolvedValueOnce(makeBatch({ completesSweep: true }))
      .mockResolvedValueOnce(makeBatch({ completesSweep: false }))
    const dependencies = {
      advanceMicrosoftStoreSourceRecoveryCursor: advance,
      enqueueContinueRecoverMicrosoftStoreSources: enqueueContinuation,
      enqueueReconcileMicrosoftStoreSource: enqueueSource,
      findRecoverableMicrosoftStoreSourceJobs: find,
    }

    await recoverMicrosoftStoreSources(dependencies)
    await recoverMicrosoftStoreSources(dependencies)

    expect(enqueueContinuation).not.toHaveBeenCalled()
  })
})

function makeBatch(
  overrides: Partial<MicrosoftStoreSourceRecoveryBatch> = {},
): MicrosoftStoreSourceRecoveryBatch {
  const sourceId = randomUUID()
  return {
    sourceIds: [sourceId],
    previousCursor: null,
    previousUpperBound: null,
    sweepUpperBound: sourceId,
    nextCursor: sourceId,
    completesSweep: false,
    ...overrides,
  }
}
