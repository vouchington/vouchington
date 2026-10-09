import {
  advanceFollowerDistributionChunkCursor,
  processFollowerDistributionChunk,
  streamIncompleteFollowerDistributionIdBatches,
} from '@services/follower-distributions'
import {
  enqueueBulkProcessFollowerDistributions,
  enqueueContinueFollowerDistribution,
} from '@queues/follower-distributions/enqueues'
import { enqueueBulkDeliverNotificationPushIntents } from '@queues/notifications/enqueues'

type FollowerDistributionDependencies = {
  advanceFollowerDistributionChunkCursor: typeof advanceFollowerDistributionChunkCursor
  enqueueBulkDeliverNotificationPushIntents: typeof enqueueBulkDeliverNotificationPushIntents
  enqueueBulkProcessFollowerDistributions: typeof enqueueBulkProcessFollowerDistributions
  processFollowerDistributionChunk: typeof processFollowerDistributionChunk
  streamIncompleteFollowerDistributionIdBatches: typeof streamIncompleteFollowerDistributionIdBatches
}

type ProcessFollowerDistributionDependencies = Pick<
  FollowerDistributionDependencies,
  | 'advanceFollowerDistributionChunkCursor'
  | 'enqueueBulkDeliverNotificationPushIntents'
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
    // This job is still active and holds its own dedup id, so the next chunk is keyed by the
    // cursor just advanced to. A null add means that exact continuation is already queued or running.
    if (!result.completed) {
      await enqueueContinueFollowerDistribution(data.distributionId, result.cursorRecipientId)
    }
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
