import { describe, expect, it, vi } from 'vitest'
import type { ReconcileEntityData } from '@queues/entity-listeners/types'
import { reconcileEntity, reconcileEntityBatches } from './reconciliation.mts'

describe('reconcileEntityBatches', () => {
  it('advances the durable checkpoint only after every entity finishes', async () => {
    const first: ReconcileEntityData = {
      entityType: 'user',
      entityId: 'user-1',
      changedAtEpochUs: '1',
    }
    const second: ReconcileEntityData = {
      entityType: 'topic',
      entityId: 'topic-1',
      changedAtEpochUs: '2',
    }
    const completedThrough = new Date('2026-07-17T00:00:00.000Z')
    const reconcile = vi.fn<(data: ReconcileEntityData) => Promise<void>>(async () => {})
    const advanceCheckpoint = vi.fn<(completedThrough: Date) => Promise<void>>(async () => {})

    await expect(
      reconcileEntityBatches(toAsyncBatches([[first], [second]]), completedThrough, {
        reconcileEntity: reconcile,
        advanceCheckpoint,
      }),
    ).resolves.toEqual({ reconciled: 2 })

    expect(reconcile.mock.calls).toEqual([[first], [second]])
    expect(advanceCheckpoint).toHaveBeenCalledWith(completedThrough)
    expect(reconcile.mock.invocationCallOrder[1]).toBeLessThan(
      advanceCheckpoint.mock.invocationCallOrder[0]!,
    )
  })

  it('leaves the checkpoint unchanged when an entity fails', async () => {
    const failure = new Error('entity reconciliation failed')
    const advanceCheckpoint = vi.fn<(completedThrough: Date) => Promise<void>>(async () => {})

    await expect(
      reconcileEntityBatches(
        toAsyncBatches([[{ entityType: 'user', entityId: 'user-1', changedAtEpochUs: '1' }]]),
        new Date(),
        {
          reconcileEntity: vi.fn<(data: ReconcileEntityData) => Promise<void>>(async () => {
            throw failure
          }),
          advanceCheckpoint,
        },
      ),
    ).rejects.toThrow(failure)

    expect(advanceCheckpoint).not.toHaveBeenCalled()
  })
})

describe('reconcileEntity', () => {
  it('routes every entity type through its idempotent current-state processor', async () => {
    const dependencies = {
      processImageCreated: vi.fn<VitestLooseMock>(),
      processAutoFollowReferrer: vi.fn<VitestLooseMock>(),
      processPostCreated: vi.fn<VitestLooseMock>(),
      processPostDeleted: vi.fn<VitestLooseMock>(),
      processPostUpdated: vi.fn<VitestLooseMock>(),
      processTopicCurrentState: vi.fn<VitestLooseMock>(),
      processUrlCreated: vi.fn<VitestLooseMock>(),
      processUserCreated: vi.fn<VitestLooseMock>(),
    }

    await reconcileEntity(
      {
        entityType: 'user',
        entityId: 'user-1',
        changedAtEpochUs: '1',
        referrerId: 'user-2',
      },
      dependencies,
    )
    await reconcileEntity(
      { entityType: 'topic', entityId: 'topic-1', changedAtEpochUs: '2' },
      dependencies,
    )
    await reconcileEntity(
      { entityType: 'post_created', entityId: 'post-2', changedAtEpochUs: '4' },
      dependencies,
    )
    await reconcileEntity(
      {
        entityType: 'post_updated',
        entityId: 'post-3',
        changedAtEpochUs: '5',
        contentChanged: true,
      },
      dependencies,
    )
    await reconcileEntity(
      { entityType: 'post_deleted', entityId: 'post-4', changedAtEpochUs: '6' },
      dependencies,
    )
    await reconcileEntity(
      { entityType: 'image', entityId: 'image-1', changedAtEpochUs: '7' },
      dependencies,
    )
    await reconcileEntity(
      { entityType: 'url', entityId: 'url-1', changedAtEpochUs: '8' },
      dependencies,
    )

    expect(dependencies.processUserCreated).toHaveBeenCalledWith({ id: 'user-1' })
    expect(dependencies.processAutoFollowReferrer).toHaveBeenCalledWith({
      newUserId: 'user-1',
      referrerId: 'user-2',
    })
    expect(dependencies.processTopicCurrentState).toHaveBeenCalledWith({ id: 'topic-1' })
    expect(dependencies.processPostCreated).toHaveBeenCalledWith({ id: 'post-2' })
    expect(dependencies.processPostUpdated).toHaveBeenCalledWith({
      id: 'post-3',
      contentChanged: true,
    })
    expect(dependencies.processPostDeleted).toHaveBeenCalledWith({
      id: 'post-4',
    })
    expect(dependencies.processImageCreated).toHaveBeenCalledWith({ id: 'image-1' })
    expect(dependencies.processUrlCreated).toHaveBeenCalledWith({ id: 'url-1' })
  })
})

async function* toAsyncBatches<T>(batches: T[][]): AsyncGenerator<T[]> {
  yield* batches
}
