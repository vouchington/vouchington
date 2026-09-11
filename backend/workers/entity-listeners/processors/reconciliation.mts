import {
  advanceEntityReconciliationCheckpoint,
  getEntityReconciliationWindow,
  streamEntityReconciliationCandidateBatches,
} from '@services/entity-listener-reconciliation'
import { getEntityListenerReconciliationIntervalSeconds } from '@queues/entity-listeners/config'
import type { ReconcileEntityData } from '@queues/entity-listeners/types'
import { processImageCreated } from './images.mts'
import { processPostCreated, processPostDeleted, processPostUpdated } from './posts.mts'
import { processTopicCreated } from './topics.mts'
import { processUrlCreated } from './urls.mts'
import { processAutoFollowReferrer, processUserCreated } from './users.mts'

type ReconcileEntityDependencies = {
  processImageCreated: typeof processImageCreated
  processAutoFollowReferrer: typeof processAutoFollowReferrer
  processPostCreated: typeof processPostCreated
  processPostDeleted: typeof processPostDeleted
  processPostUpdated: typeof processPostUpdated
  processTopicCurrentState: typeof processTopicCreated
  processUrlCreated: typeof processUrlCreated
  processUserCreated: typeof processUserCreated
}

const RECONCILE_ENTITY_DEPENDENCIES: ReconcileEntityDependencies = {
  processImageCreated,
  processAutoFollowReferrer,
  processPostCreated,
  processPostDeleted,
  processPostUpdated,
  processTopicCurrentState: processTopicCreated,
  processUrlCreated,
  processUserCreated,
}

export async function reconcileEntities(): Promise<{ reconciled: number }> {
  const window = await getEntityReconciliationWindow(
    getEntityListenerReconciliationIntervalSeconds(),
  )
  return await reconcileEntityBatches(
    streamEntityReconciliationCandidateBatches(window),
    window.end,
  )
}

type ReconcileEntityBatchDependencies = {
  advanceCheckpoint: typeof advanceEntityReconciliationCheckpoint
  reconcileEntity: (data: ReconcileEntityData) => Promise<void>
}

export async function reconcileEntityBatches(
  batches: AsyncIterable<ReconcileEntityData[]>,
  completedThrough: Date,
  dependencies: ReconcileEntityBatchDependencies = {
    advanceCheckpoint: advanceEntityReconciliationCheckpoint,
    reconcileEntity,
  },
): Promise<{ reconciled: number }> {
  let reconciled = 0
  for await (const batch of batches) {
    for (const candidate of batch) {
      // oxlint-disable-next-line no-await-in-loop -- the checkpoint must not outrun any entity side effect
      await dependencies.reconcileEntity(candidate)
      reconciled += 1
    }
  }
  await dependencies.advanceCheckpoint(completedThrough)
  return { reconciled }
}

export async function reconcileEntity(
  data: ReconcileEntityData,
  dependencies = RECONCILE_ENTITY_DEPENDENCIES,
): Promise<void> {
  switch (data.entityType) {
    case 'user':
      await dependencies.processUserCreated({ id: data.entityId })
      if (data.referrerId) {
        await dependencies.processAutoFollowReferrer({
          newUserId: data.entityId,
          referrerId: data.referrerId,
        })
      }
      return
    case 'topic':
      await dependencies.processTopicCurrentState({ id: data.entityId })
      return
    case 'post_created':
      await dependencies.processPostCreated({ id: data.entityId })
      return
    case 'post_updated':
      await dependencies.processPostUpdated({
        id: data.entityId,
        contentChanged: data.contentChanged,
      })
      return
    case 'post_deleted':
      await dependencies.processPostDeleted({ id: data.entityId })
      return
    case 'image':
      await dependencies.processImageCreated({ id: data.entityId })
      return
    case 'url':
      await dependencies.processUrlCreated({ id: data.entityId })
  }
}
