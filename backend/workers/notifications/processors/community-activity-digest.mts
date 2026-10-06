import {
  enqueueBulkDeliverNotificationPushIntents,
  enqueueCommunityActivityDigestBatch,
  type CommunityActivityDigestBatchData,
  type CommunityActivityDigestDispatchData,
} from '@queues/notifications/enqueues'
import { createCommunityActivityDigestBatch } from '@services/notifications/community-activity-digest'
import {
  completeCommunityActivityDigestWorkItem,
  renewCommunityActivityDigestWorkItem,
} from '@services/notifications/community-activity-digest-dispatch'

type Dependencies = {
  enqueueBulkDeliverNotificationPushIntents: typeof enqueueBulkDeliverNotificationPushIntents
  enqueueCommunityActivityDigestBatch: typeof enqueueCommunityActivityDigestBatch
  createCommunityActivityDigestBatch: typeof createCommunityActivityDigestBatch
  completeCommunityActivityDigestWorkItem: typeof completeCommunityActivityDigestWorkItem
  renewCommunityActivityDigestWorkItem: typeof renewCommunityActivityDigestWorkItem
}

export async function processCommunityActivityDigestDispatch(
  data: CommunityActivityDigestDispatchData,
  dependencies?: Partial<Dependencies>,
): Promise<void> {
  const enqueueBatch =
    dependencies?.enqueueCommunityActivityDigestBatch ?? enqueueCommunityActivityDigestBatch
  const renew =
    dependencies?.renewCommunityActivityDigestWorkItem ?? renewCommunityActivityDigestWorkItem
  if (!(await renew(new Date(data.windowStart), data.leaseToken))) return
  await enqueueBatch(data)
}

export async function processCommunityActivityDigestBatch(
  data: CommunityActivityDigestBatchData,
  dependencies?: Partial<Dependencies>,
): Promise<void> {
  const result = await refreshActivityAndCreateBatch(data, dependencies)
  if (!result) return
  if (result.nextUserId) {
    const enqueueBatch =
      dependencies?.enqueueCommunityActivityDigestBatch ?? enqueueCommunityActivityDigestBatch
    await enqueueBatch({ ...data, afterUserId: result.nextUserId })
    return
  }
  const markCompleted =
    dependencies?.completeCommunityActivityDigestWorkItem ?? completeCommunityActivityDigestWorkItem
  await markCompleted(new Date(data.windowStart), data.leaseToken)
}

async function refreshActivityAndCreateBatch(
  data: CommunityActivityDigestBatchData,
  dependencies?: Partial<Dependencies>,
) {
  const refreshActivity =
    dependencies?.renewCommunityActivityDigestWorkItem ?? renewCommunityActivityDigestWorkItem
  if (!(await refreshActivity(new Date(data.windowStart), data.leaseToken))) return null
  return createBatchAndDispatchPushes(data, dependencies)
}

async function createBatchAndDispatchPushes(
  data: CommunityActivityDigestBatchData,
  dependencies?: Partial<Dependencies>,
) {
  const createBatch =
    dependencies?.createCommunityActivityDigestBatch ?? createCommunityActivityDigestBatch
  const result = await createBatch({
    windowStart: new Date(data.windowStart),
    windowEnd: new Date(data.windowEnd),
    afterUserId: data.afterUserId,
  })
  const enqueuePushes =
    dependencies?.enqueueBulkDeliverNotificationPushIntents ??
    enqueueBulkDeliverNotificationPushIntents
  await enqueuePushes(
    result.created.map(item => ({ userId: item.userId, notificationId: item.notificationId })),
  )
  return result
}
