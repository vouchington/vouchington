import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import {
  ENTITY_LISTENER_ORDERING,
  getEntityListenerReconciliationIntervalSeconds,
  POST_CATEGORY_FINALIZATION_RECONCILIATION_DEDUPLICATION_ID,
  POST_CATEGORY_FINALIZATION_RECONCILIATION_DEDUPLICATION_TTL_MS,
  PRIORITY_DEFAULT,
  PRIORITY_DISPATCHER,
  QUEUE_NAME,
} from '../config.mts'
import { entitiesListeners } from '../queues.mts'
import type { ReconcileEntityData } from '../types.mts'

const DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
}

function logicalEntityJobId(data: ReconcileEntityData): string {
  const changeKey = data.changeId ?? data.changedAtEpochUs
  return `entity-reconcile__${data.entityType}__${data.entityId}__${changeKey}`
}

export const enqueueBulkReconcileEntities = createBulkEnqueueFunction<
  ReconcileEntityData,
  ReconcileEntityData,
  'reconcileEntity'
>({
  queue: entitiesListeners,
  queueName: QUEUE_NAME,
  jobName: 'reconcileEntity',
  defaults: DEFAULTS,
  buildJob: data => {
    const jobId = logicalEntityJobId(data)
    return {
      data,
      opts: {
        jobId,
        priority: PRIORITY_DEFAULT,
        deduplication: { id: jobId, mode: 'simple' as const },
      },
    }
  },
})

const enqueueReconcileEntitiesJob = createEnqueueFunction<
  Record<string, never>,
  'reconcileEntities'
>({
  queue: entitiesListeners,
  queueName: QUEUE_NAME,
  jobName: 'reconcileEntities',
  defaults: DEFAULTS,
})

const enqueueReconcilePostCategoryFinalizationsJob = createEnqueueFunction<
  Record<string, never>,
  'processReconcilePostCategoryFinalizations'
>({
  queue: entitiesListeners,
  queueName: QUEUE_NAME,
  jobName: 'processReconcilePostCategoryFinalizations',
  defaults: DEFAULTS,
})

export function enqueueReconcilePostCategoryFinalizations(): EnqueueReturnType {
  return enqueueReconcilePostCategoryFinalizationsJob({}, {
    priority: PRIORITY_DISPATCHER,
    ordering: ENTITY_LISTENER_ORDERING.post_category_finalization_reconciliation,
    deduplication: {
      id: POST_CATEGORY_FINALIZATION_RECONCILIATION_DEDUPLICATION_ID,
      mode: 'throttle',
      ttl: POST_CATEGORY_FINALIZATION_RECONCILIATION_DEDUPLICATION_TTL_MS,
    },
  } satisfies Partial<JobOptions>)
}

/** Chains another bounded page without throttle deduplication; queue ordering keeps it serialized. */
export function enqueueContinuePostCategoryFinalizations(): EnqueueReturnType {
  return enqueueReconcilePostCategoryFinalizationsJob({}, {
    priority: PRIORITY_DISPATCHER,
    ordering: ENTITY_LISTENER_ORDERING.post_category_finalization_reconciliation,
  } satisfies Partial<JobOptions>)
}

export function enqueueReconcileEntities(): EnqueueReturnType {
  const intervalMs = getEntityListenerReconciliationIntervalSeconds() * 1000
  const jobId = `entity-reconciliation-dispatcher__${Math.floor(Date.now() / intervalMs)}`
  return enqueueReconcileEntitiesJob({}, {
    jobId,
    priority: PRIORITY_DISPATCHER,
    deduplication: {
      id: 'entity-reconciliation-dispatcher',
      mode: 'throttle',
      ttl: intervalMs,
    },
  } satisfies Partial<JobOptions>)
}
