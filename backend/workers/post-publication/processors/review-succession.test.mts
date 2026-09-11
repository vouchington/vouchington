import { describe, expect, it } from 'vitest'
import { processReconcilePostPublication } from '../processors.mts'
import { reconcileReviewSuccessionBeforePostPublication } from './review-succession.mts'
import { makeDependencies, post } from './test-helpers.mts'

describe('post publication review succession phase', () => {
  it('defers projections and the old generation when review succession writes new work', async () => {
    const dependencies = makeDependencies()
    dependencies.reconcileReviewSuccessionsForPostIds.mockResolvedValueOnce({
      changedPostIds: ['00000000-0000-7000-8000-000000000010'],
    })

    await expect(processReconcilePostPublication({}, dependencies)).resolves.toEqual({
      reconciled: 0,
    })

    expect(dependencies.reconcileReviewSuccessionsForPostIds).toHaveBeenCalledWith([post.id])
    expect(dependencies.withPostPublicationReconciliationLocks).not.toHaveBeenCalled()
    expect(dependencies.acknowledgePostPublicationProjectionReceipts).not.toHaveBeenCalled()
    expect(dependencies.acknowledgePostPublicationDirtyWork).not.toHaveBeenCalled()
    expect(dependencies.enqueueContinuePostPublicationReconciliation).toHaveBeenCalledOnce()
  })

  it('allows projection work to continue when review succession is unchanged', async () => {
    const dependencies = makeDependencies()

    await expect(
      reconcileReviewSuccessionBeforePostPublication([post.id], dependencies),
    ).resolves.toBe(false)

    expect(dependencies.enqueueContinuePostPublicationReconciliation).not.toHaveBeenCalled()
  })
})
