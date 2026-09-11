import {
  advanceFollowerDistributionChunkCursor,
  processFollowerDistributionChunk,
  streamIncompleteFollowerDistributionIdBatches,
} from '@services/follower-distributions'
import {
  enqueueBulkProcessFollowerDistributions,
  enqueueProcessFollowerDistribution,
} from '@queues/follower-distributions/enqueues'
import { enqueueBulkDeliverNotificationPushIntents } from '@queues/notifications/enqueues'

type FollowerDistributionDependencies = {
  advanceFollowerDistributionChunkCursor: typeof advanceFollowerDistributionChunkCursor
  enqueueBulkDeliverNotificationPushIntents: typeof enqueueBulkDeliverNotificationPushIntents
  enqueueBulkProcessFollowerDistributions: typeof enqueueBulkProcessFollowerDistributions
  enqueueProcessFollowerDistribution: typeof enqueueProcessFollowerDistribution
  processFollowerDistributionChunk: typeof processFollowerDistributionChunk
  streamIncompleteFollowerDistributionIdBatches: typeof streamIncompleteFollowerDistributionIdBatches
}

type ProcessFollowerDistributionDependencies = Pick<
  FollowerDistributionDependencies,
  | 'advanceFollowerDistributionChunkCursor'
  | 'enqueueBulkDeliverNotificationPushIntents'
  | 'enqueueProcessFollowerDistribution'
  | 'processFollowerDistributionChunk'
>

type BackfillFollowerDistributionDependencies = Pick<
  FollowerDistributionDependencies,
  'enqueueBulkProcessFollowerDistributions' | 'streamIncompleteFollowerDistributionIdBatches'
>

export async function processFollowerDistribution(
  data: { distributionId: string },
  dependencies?: Partial<ProcessFollowerDistributionDependencies>,
) {
  const deps = {
    advanceFollowerDistributionChunkCursor,
    enqueueBulkDeliverNotificationPushIntents,
    enqueueProcessFollowerDistribution,
    processFollowerDistributionChunk,
    ...dependencies,
  }
  const result = await deps.processFollowerDistributionChunk(data.distributionId, {
    deferCursorUpdate: true,
  })
  if (result.notificationsToDeliver.length > 0) {
    await deps.enqueueBulkDeliverNotificationPushIntents(result.notificationsToDeliver)
  }
  if (result.cursorRecipientId) {
    await deps.advanceFollowerDistributionChunkCursor(
      result.distributionId,
      result.cursorRecipientId,
      result.completed,
    )
  }
  if (!result.completed) {
    await deps.enqueueProcessFollowerDistribution(data.distributionId)
  }
  return result
}

export async function backfillFollowerDistributions(
  dependencies?: Partial<BackfillFollowerDistributionDependencies>,
) {
  const streamBatches =
    dependencies?.streamIncompleteFollowerDistributionIdBatches ??
    streamIncompleteFollowerDistributionIdBatches
  const enqueueBulk =
    dependencies?.enqueueBulkProcessFollowerDistributions ?? enqueueBulkProcessFollowerDistributions
  let enqueued = 0
  for await (const ids of streamBatches()) {
    await enqueueBulk(ids)
    enqueued += ids.length
  }
  return { enqueued }
}
