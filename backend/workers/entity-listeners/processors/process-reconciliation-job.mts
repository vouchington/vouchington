import { processRetainedSweep } from '@data-stores/valkey-glide-mq'
import type { EntityReconciliationDispatchData } from '@queues/entity-listeners/types'
import type { Job } from 'glide-mq'
import { parseReconciliationDispatch } from '@queues/entity-listeners/payload/job-payload-reconciliation'
import { reconcileEntities } from './reconciliation.mts'

export async function processReconciliationJob(
  job: Pick<Job, 'data' | 'updateData' | 'moveToDelayed'>,
  reconcile: (
    data: EntityReconciliationDispatchData,
    save: (data: EntityReconciliationDispatchData) => Promise<void>,
  ) => Promise<{ reconciled: number; hasMore: boolean }> = reconcileEntities,
): Promise<unknown> {
  const data = parseReconciliationDispatch(job.data)
  return processRetainedSweep(job, save => reconcile(data, save))
}
