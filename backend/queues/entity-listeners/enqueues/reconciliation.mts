import { randomUUID } from 'node:crypto'
import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '@queues/background/enqueues'
import {
  ENTITY_LISTENERS_RECONCILE_ENTITIES_JOB,
  ENTITY_LISTENERS_RECONCILE_ENTITY_JOB,
} from '@queues/background/enqueues/entity-listeners-jobs'
import type { EnqueueReturnType } from '@voucha/types'
import type { ReconcileEntityData } from '../types.mts'

function logicalEntityJobId(data: ReconcileEntityData): string {
  const changeKey = data.changeId ?? data.changedAtEpochUs
  return `entity-reconcile__${data.entityType}__${data.entityId}__${changeKey}`
}

/**
 * @public Retained provisionally under issue #1360; external production use is unconfirmed and this
 * export may be made private or removed after intended-use review. Evidence: `docs/overview/architecture/queues/entity-listeners/README.md`.
 */
export const enqueueBulkReconcileEntities = createBackgroundBulkEnqueue(
  ENTITY_LISTENERS_RECONCILE_ENTITY_JOB,
  (data: ReconcileEntityData) => {
    const jobId = logicalEntityJobId(data)
    return {
      data,
      opts: { jobId, deduplication: { id: jobId, mode: 'simple' as const } },
    }
  },
)

const enqueueReconcileEntitiesJob = createBackgroundEnqueue(ENTITY_LISTENERS_RECONCILE_ENTITIES_JOB)

/** One root job at a time: a second root while one sweep is queued or running is coalesced. */
export function entityReconciliationRootOptions() {
  return {
    jobId: `entity-reconciliation-dispatcher__${randomUUID()}`,
    deduplication: { id: 'entity-reconciliation-dispatcher', mode: 'simple' as const },
  }
}

/** Starts one fixed-window reconciliation; the job pages itself through its saved cursor. */
export function enqueueReconcileEntities(): EnqueueReturnType {
  return enqueueReconcileEntitiesJob({}, entityReconciliationRootOptions())
}
