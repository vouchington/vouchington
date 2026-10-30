import { onTestFinished } from 'vitest'
import { backgroundQueue as activitypub } from './shared-background-queue.mts'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import { releaseActivityPubInboxDelivery } from '@data-stores/valkey-glide-mq/activitypub-inbox-reservations'
import { remoteActorsWorkMaxValues } from '../services/remote-actors/work-limits.mts'

/** Find only records owned by this exact signed request, across queue states. */
export function findActivityPubInboxJobsForRequestDigest(requestDigest: string) {
  return activitypub.searchJobs({
    name: 'activitypub.processDelivery',
    data: { requestDigest },
    limit: remoteActorsWorkMaxValues.inbound_backlog_cap,
  })
}

/** Remove the request-owned queue record after its worker has settled. */
export async function removeActivityPubInboxJobForRequestDigest(
  requestDigest: string,
): Promise<number> {
  const jobs = await findActivityPubInboxJobsForRequestDigest(requestDigest)
  await Promise.all(
    jobs.map(async job => {
      if ((await job.getState()) === 'active')
        throw new Error(`ActivityPub inbox job ${job.id} is active after worker completion`)
      await job.remove()
      await releaseActivityPubInboxDelivery(BACKGROUND_QUEUE_NAME, job.id)
    }),
  )
  return jobs.length
}

export function registerActivityPubInboxJobCleanup(requestDigest: string): void {
  onTestFinished(async () => {
    await removeActivityPubInboxJobForRequestDigest(requestDigest)
  })
}
