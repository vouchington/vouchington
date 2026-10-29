import { onTestFinished } from 'vitest'
import { backgroundQueue as activitypub } from './shared-background-queue.mts'

/** Remove the request-owned queue record after its worker has settled. */
export async function removeActivityPubInboxJobForRequestDigest(
  requestDigest: string,
): Promise<number> {
  const job = await activitypub.getJob(`activitypub-inbox__${requestDigest}`)
  if (!job) return 0
  if ((await job.getState()) === 'active')
    throw new Error(`ActivityPub inbox job ${job.id} is active after worker completion`)
  await job.remove()
  return 1
}

export function registerActivityPubInboxJobCleanup(requestDigest: string): void {
  onTestFinished(async () => {
    await removeActivityPubInboxJobForRequestDigest(requestDigest)
  })
}
