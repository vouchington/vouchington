import { onTestFinished } from 'vitest'
import { activitypub } from '../queues/activitypub/queues.mts'
import {
  ACTIVITYPUB_PROCESS_DELIVERY_JOB,
  ACTIVITYPUB_REARM_FAILED_DELIVERIES_JOB,
} from '../queues/background/enqueues/activitypub-jobs.mts'
import { getActivityPubInboxDeliveryIdentityForTest } from './entities/activitypub-inbox.mts'
import { readAllQueueJobs } from './queue-jobs.mts'

/** Remove only jobs whose real payload names this test delivery; reject an in-flight worker. */
export async function removeActivityPubInboxJobsForDeliveryId(
  deliveryId: string,
  knownLeaseTokens: readonly string[] = [],
): Promise<number> {
  const jobs = new Map((await readAllQueueJobs(activitypub)).map(job => [job.id, job]))
  const expectedJobs = new Map<string, string>()
  for (const leaseToken of knownLeaseTokens)
    expectedJobs.set(`activitypub-inbox__${deliveryId}__${leaseToken}`, leaseToken)
  expectedJobs.set(`activitypub-inbox-failed-backfill__${deliveryId}`, '')
  for (const id of expectedJobs.keys()) {
    const job = await activitypub.getJob(id)
    if (job) jobs.set(id, job)
  }
  let removed = 0
  for (const job of jobs.values()) {
    const data: unknown = job.data
    if (typeof data !== 'object' || data === null) {
      if (expectedJobs.has(job.id))
        throw new Error(`ActivityPub job ${job.id} does not match its owned delivery`)
      continue
    }
    const owned =
      (job.name === ACTIVITYPUB_PROCESS_DELIVERY_JOB.name &&
        'deliveryId' in data &&
        data.deliveryId === deliveryId) ||
      (job.name === ACTIVITYPUB_REARM_FAILED_DELIVERIES_JOB.name &&
        'afterId' in data &&
        data.afterId === deliveryId)
    const expectedLeaseToken = expectedJobs.get(job.id)
    if (
      expectedLeaseToken !== undefined &&
      (!owned ||
        (expectedLeaseToken !== '' &&
          (!('leaseToken' in data) || data.leaseToken !== expectedLeaseToken)))
    )
      throw new Error(`ActivityPub job ${job.id} does not match its owned delivery`)
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
  leaseToken: string,
  activityId?: string,
): void {
  onTestFinished(async () => {
    const current = activityId
      ? await getActivityPubInboxDeliveryIdentityForTest(activityId)
      : undefined
    await removeActivityPubInboxJobsForDeliveryId(
      deliveryId,
      current ? [leaseToken, current.leaseToken] : [leaseToken],
    )
  })
}
