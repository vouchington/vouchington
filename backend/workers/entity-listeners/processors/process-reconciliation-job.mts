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
  const result = await reconcile(data, next => job.updateData(next))
  // Successful capped passes retain the same simple-deduplicated job. Side-effect failures
  // propagate unchanged after saving progress, preserving the queue's bounded retry policy.
  if (result.hasMore) return job.moveToDelayed(Date.now())
  return result
}
