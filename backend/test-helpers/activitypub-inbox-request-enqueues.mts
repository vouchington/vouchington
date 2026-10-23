import { onTestFinished } from 'vitest'
import { activitypub } from '../queues/activitypub/queues.mts'
import { getActivityPubInboxDeliveryIdentityForTest } from './entities/activitypub-inbox.mts'
import { deleteActivityPubInboxDeliveriesForTest } from './entities/activitypub-inbox-storage.mts'
import { removeActivityPubInboxJobsForDeliveryId } from './activitypub-inbox-test-jobs.mts'
import { onEnqueueAdmission } from '../data-stores/valkey-glide-mq/glide-mq-admission.mts'
import { getActivityPubInboxTestRequestId } from './api/request-query-profile.mts'

/** Observe exact request-owned factory admissions, rather than a global queue difference. */
export async function observeActivityPubInboxRequestEnqueues<Result>(
  requestId: string,
  run: () => Promise<Result>,
): Promise<{ result: Result; enqueueCalls: number }> {
  let enqueueCalls = 0
  const off = onEnqueueAdmission(event => {
    if (
      event.queue === activitypub &&
      event.jobName === 'activitypub.processDelivery' &&
      getActivityPubInboxTestRequestId() === requestId
    )
      enqueueCalls++
    return undefined
  })
  onTestFinished(off)
  try {
    return { result: await run(), enqueueCalls }
  } finally {
    off()
  }
}

/** Response completion settles the route's enqueue; remove only its returned delivery and jobs. */
export async function cleanupActivityPubInboxRequest(
  activityId: string,
  deliveryId?: string,
): Promise<number> {
  const identity = await getActivityPubInboxDeliveryIdentityForTest(activityId)
  const id = deliveryId ?? identity?.deliveryId
  if (!id) return 0
  const removed = await removeActivityPubInboxJobsForDeliveryId(
    id,
    identity ? [identity.leaseToken] : [],
  )
  await deleteActivityPubInboxDeliveriesForTest([id])
  return removed
}

export function registerActivityPubInboxRequestCleanup(activityId: string) {
  let deliveryId: string | undefined
  let cleanupPromise: Promise<number> | undefined
  const cleanup = () => {
    cleanupPromise ??= cleanupActivityPubInboxRequest(activityId, deliveryId)
    return cleanupPromise
  }
  onTestFinished(async () => {
    await cleanup()
  })
  return {
    captureDeliveryId: (id: string) => {
      deliveryId = id
    },
    cleanup,
  }
}
