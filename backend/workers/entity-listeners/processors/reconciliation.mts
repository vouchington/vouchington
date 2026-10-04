import { getEntityReconciliationLimits } from '@services/entity-listener-reconciliation/work-limits'
import {
  advanceEntityReconciliationCheckpoint,
  getEntityReconciliationWindow,
  streamEntityReconciliationCandidateBatches,
} from '@services/entity-listener-reconciliation'
import { getEntityListenerReconciliationIntervalSeconds } from '@queues/entity-listeners/config'
import type {
  ReconcileEntityData,
  EntityReconciliationDispatchData,
} from '@queues/entity-listeners/types'
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

export { enqueueReconcileEntities } from '@queues/entity-listeners/enqueues/reconciliation'

export async function reconcileEntities(
  data: EntityReconciliationDispatchData = {},
  saveProgress: (data: EntityReconciliationDispatchData) => Promise<void> = async () => {},
) {
  const window = data.window
    ? { start: new Date(data.window.start), end: new Date(data.window.end) }
    : await getEntityReconciliationWindow(getEntityListenerReconciliationIntervalSeconds())
  const fixedWindow = {
    start: window.start.toISOString(),
    end: window.end.toISOString(),
  }
  // Persist the window before any side effect, including a failure on its first candidate.
  await saveProgress({
    window: fixedWindow,
    ...(data.after && { after: data.after }),
  })
  const limits = getEntityReconciliationLimits()
  let hasMore = false
  const batches = streamEntityReconciliationCandidateBatches(window, {
    after: data.after,
    limits,
    onComplete: result => {
      hasMore = result.hasMore
    },
  })
  return reconcileEntityBatches(batches, window.end, undefined, {
    hasMore: () => hasMore,
    initialAfter: data.after,
    onMore: after => saveProgress({ window: fixedWindow, ...(after && { after }) }),
  })
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
  options: {
    hasMore: () => boolean
    initialAfter?: ReconcileEntityData
    onMore: (after?: ReconcileEntityData) => Promise<unknown>
  } = {
    hasMore: () => false,
    onMore: async () => {},
  },
): Promise<{ reconciled: number; hasMore: boolean }> {
  let reconciled = 0
  let after = options.initialAfter
  try {
    for await (const batch of batches) {
      for (const candidate of batch) {
        // oxlint-disable-next-line no-await-in-loop -- the checkpoint must not outrun any entity side effect
        await dependencies.reconcileEntity(candidate)
        after = candidate
        reconciled += 1
      }
    }
  } catch (err) {
    if (after) await options.onMore(after)
    throw err
  }
  const hasMore = options.hasMore()
  if (hasMore) await options.onMore(after)
  else await dependencies.advanceCheckpoint(completedThrough)
  return { reconciled, hasMore }
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
