import { processRetainedSweep } from '@data-stores/valkey-glide-mq'
import {
  advanceFollowerDistributionChunkCursor,
  processFollowerDistributionChunk,
  listIncompleteFollowerDistributionIdPage,
} from '@services/follower-distributions'
import {
  enqueueBackfillFollowerDistributionsContinuation,
  enqueueBulkProcessFollowerDistributions,
} from '@queues/follower-distributions/enqueues'
import { enqueueBulkDeliverNotificationPushIntents } from '@queues/notifications/enqueues'
import type { Job } from 'glide-mq'

/**
 * Processes one recipient chunk and, while recipients may remain, moves the same job to delayed
 * so it runs the next chunk. The active job holds the distribution's dedup id, so enqueueing a
 * continuation under that id would be skipped. The delay error `moveToDelayed` throws must reach
 * GlideMQ, so nothing here catches it; the PostgreSQL cursor carries the progress.
 */
export async function processFollowerDistribution(
  job: Pick<Job<{ distributionId: string }>, 'data' | 'updateData' | 'moveToDelayed'>,
) {
  return processRetainedSweep(job, async () => {
    const result = await processFollowerDistributionChunk(job.data.distributionId, {
      deferCursorUpdate: true,
    })
    if (result.notificationsToDeliver.length > 0) {
      await enqueueBulkDeliverNotificationPushIntents(result.notificationsToDeliver)
    }
    if (result.cursorRecipientId) {
      await advanceFollowerDistributionChunkCursor(
        result.distributionId,
        result.cursorRecipientId,
        result.completed,
      )
    }
    return { ...result, hasMore: !result.completed }
  })
}

/**
 * Enqueues one bounded page of incomplete distributions after `afterId`, then continues from the
 * page's last id, so a backlog never runs inside one job.
 */
export async function backfillFollowerDistributions(afterId?: string) {
  const { ids, hasMore } = await listIncompleteFollowerDistributionIdPage(afterId)
  if (ids.length > 0) await enqueueBulkProcessFollowerDistributions(ids)
  if (hasMore) await enqueueBackfillFollowerDistributionsContinuation(ids.at(-1)!)
  return { enqueued: ids.length, hasMore }
}
