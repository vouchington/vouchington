import { randomUUID } from 'node:crypto'
import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { PRIORITY_DEFAULT, PRIORITY_DISPATCHER, QUEUE_NAME } from '../config.mts'
import { entitiesListeners } from '../queues.mts'
import type { ReconcileEntityData, EntityReconciliationDispatchData } from '../types.mts'

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
  EntityReconciliationDispatchData,
  'reconcileEntities'
>({
  queue: entitiesListeners,
  queueName: QUEUE_NAME,
  jobName: 'reconcileEntities',
  defaults: DEFAULTS,
})

export function enqueueReconcileEntities(): EnqueueReturnType {
  return enqueueReconcileEntitiesJob({}, {
    jobId: `entity-reconciliation-dispatcher__${randomUUID()}`,
    priority: PRIORITY_DISPATCHER,
    deduplication: { id: 'entity-reconciliation-dispatcher', mode: 'simple' },
  } satisfies Partial<JobOptions>)
}
