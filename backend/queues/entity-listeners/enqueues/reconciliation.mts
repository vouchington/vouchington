import { randomUUID } from 'node:crypto'
import { createBackgroundEnqueue } from '@queues/background/enqueues'
import { ENTITY_LISTENERS_RECONCILE_ENTITIES_JOB } from '@queues/background/enqueues/entity-listeners-jobs'
import type { EnqueueReturnType } from '@voucha/types'

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
