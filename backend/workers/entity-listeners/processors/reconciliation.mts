import { repairReconciledBloomKeys } from '@services/entity-listener-reconciliation/bloom-repair'
import { getEntityReconciliationLimits } from '@services/entity-listener-reconciliation/work-limits'
import {
  getEntityReconciliationWindow,
  streamEntityReconciliationCandidateBatches,
} from '@services/entity-listener-reconciliation'
import type {
  ReconcileEntityData,
  EntityReconciliationDispatchData,
} from '@queues/entity-listeners/types'
import { reconcileEntityBatches } from './reconciliation-batches.mts'
import { processImageCreated } from './images.mts'
import { processPostCreated, processPostDeleted, processPostUpdated } from './posts.mts'
import { processTopicCreated } from './topics.mts'
import { processUrlCreated } from './urls.mts'
import { processAutoFollowReferrer, processUserCreated, processUserUpdated } from './users.mts'

type ReconcileEntityDependencies = {
  processImageCreated: typeof processImageCreated
  processAutoFollowReferrer: typeof processAutoFollowReferrer
  processPostCreated: typeof processPostCreated
  processPostDeleted: typeof processPostDeleted
  processPostUpdated: typeof processPostUpdated
  processTopicCurrentState: typeof processTopicCreated
  processUrlCreated: typeof processUrlCreated
  processUserCreated: typeof processUserCreated
  processUserUpdated: typeof processUserUpdated
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
  processUserUpdated,
}

export async function reconcileEntities(
  data: EntityReconciliationDispatchData = {},
  saveProgress: (data: EntityReconciliationDispatchData) => Promise<void> = async () => {},
) {
  const window = data.window
    ? { start: new Date(data.window.start), end: new Date(data.window.end) }
    : getEntityReconciliationWindow()
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
  return reconcileEntityBatches(batches, reconcileEntity, {
    hasMore: () => hasMore,
    initialAfter: data.after,
    onMore: after => saveProgress({ window: fixedWindow, ...(after && { after }) }),
  })
}

export async function reconcileEntity(
  data: ReconcileEntityData,
  dependencies = RECONCILE_ENTITY_DEPENDENCIES,
): Promise<void> {
  switch (data.entityType) {
    case 'user':
      // Candidates are selected by updated_at, and the vote-weight recalculation rewrites it, so
      // only an account created in the window replays creation effects; a replay of every update
      // would re-enqueue the recalculation forever and re-follow referrers users unfollowed.
      if (!data.createdInWindow) {
        await dependencies.processUserUpdated({ id: data.entityId })
        return
      }
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
    case 'community':
    case 'rss_feed_item':
    case 'post_slug':
    case 'api_key':
    case 'blocklisted_domain':
    case 'embedding':
    case 'topic_alias':
    case 'url_hostname':
      await repairReconciledBloomKeys(data)
      return
    case 'url':
      await dependencies.processUrlCreated({ id: data.entityId })
  }
}
