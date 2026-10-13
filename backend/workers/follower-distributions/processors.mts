import { processRetainedSweep } from '@data-stores/valkey-glide-mq'
import {
  advanceFollowerDistributionChunkCursor,
  processFollowerDistributionChunk,
  streamIncompleteFollowerDistributionIdBatches,
} from '@services/follower-distributions'
import { enqueueBulkProcessFollowerDistributions } from '@queues/follower-distributions/enqueues'
import { enqueueBulkDeliverNotificationPushIntents } from '@queues/notifications/enqueues'
import type { Job } from 'glide-mq'

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

/**
 * Processes one recipient chunk and, while recipients may remain, moves the same job to delayed
 * so it runs the next chunk. The active job holds the distribution's dedup id, so enqueueing a
 * continuation under that id would be skipped. The delay error `moveToDelayed` throws must reach
 * GlideMQ, so nothing here catches it; the PostgreSQL cursor carries the progress.
 */
export async function processFollowerDistribution(
  job: Pick<Job<{ distributionId: string }>, 'data' | 'updateData' | 'moveToDelayed'>,
  dependencies?: Partial<ProcessFollowerDistributionDependencies>,
) {
  const deps = {
    advanceFollowerDistributionChunkCursor,
    enqueueBulkDeliverNotificationPushIntents,
    processFollowerDistributionChunk,
    ...dependencies,
  }
  return processRetainedSweep(job, async () => {
    const result = await deps.processFollowerDistributionChunk(job.data.distributionId, {
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
    return { ...result, hasMore: !result.completed }
  })
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
