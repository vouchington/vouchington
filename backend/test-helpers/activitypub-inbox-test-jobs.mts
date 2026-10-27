import { onTestFinished } from 'vitest'
import { activitypub } from '../queues/activitypub/queues.mts'
import {
  ACTIVITYPUB_PROCESS_DELIVERY_JOB,
  ACTIVITYPUB_REARM_FAILED_DELIVERIES_JOB,
} from '../queues/background/enqueues/activitypub-jobs.mts'
import { readAllQueueJobs } from './queue-jobs.mts'

/** Remove only jobs whose payload names this test delivery; reject an in-flight worker. */
export async function removeActivityPubInboxJobsForDeliveryId(
  deliveryId: string,
  requestDigest?: string,
): Promise<number> {
  const jobs = new Map((await readAllQueueJobs(activitypub)).map(job => [job.id, job]))
  if (requestDigest) {
    const job = await activitypub.getJob(`activitypub-inbox__${requestDigest}`)
    if (job) jobs.set(job.id, job)
  }
  let removed = 0
  for (const job of jobs.values()) {
    const data: unknown = job.data
    if (typeof data !== 'object' || data === null) continue
    const owned =
      (job.name === ACTIVITYPUB_PROCESS_DELIVERY_JOB.name &&
        'deliveryId' in data &&
        data.deliveryId === deliveryId &&
        (!requestDigest || ('requestDigest' in data && data.requestDigest === requestDigest))) ||
      (job.name === ACTIVITYPUB_REARM_FAILED_DELIVERIES_JOB.name &&
        'afterId' in data &&
        data.afterId === deliveryId)
    if (!owned) continue
    if ((await job.getState()) === 'active')
      throw new Error(`ActivityPub job ${job.id} is active after worker completion`)
    await job.remove()
    removed++
  }
  return removed
}

export function registerActivityPubInboxJobCleanup(
  deliveryId: string,
  requestDigest: string,
): void {
  onTestFinished(async () => {
    await removeActivityPubInboxJobsForDeliveryId(deliveryId, requestDigest)
  })
}
