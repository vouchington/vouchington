import { processRetainedSweep } from '@data-stores/valkey-glide-mq'
import { getPagedDispatchLimit } from '@data-stores/valkey-glide-mq/paged-dispatcher-config'
import type { CommunityActivityDigestDispatchData } from '@queues/background/enqueues/notifications-domain'
import { background } from '@queues/background/queues'
import { enqueueBulkDeliverNotificationPushIntents } from '@queues/notifications/enqueues'
import { createCommunityActivityDigestBatch } from '@services/notifications/community-activity-digest'
import {
  type DigestCursorOptions,
  advanceCommunityActivityDigestCursor,
  isCommunityActivityDigestWindowComplete,
} from '@services/notifications/community-activity-digest-dispatch'
import type { Job } from 'glide-mq'

type WindowJob = Pick<
  Job<CommunityActivityDigestDispatchData>,
  'data' | 'updateData' | 'moveToDelayed'
>

/** One recipient page per activation, with the same live job retaining the ordering slot. */
export async function processCommunityActivityDigestDispatch(
  job: WindowJob,
  userIds?: readonly string[],
  batchSize?: number,
  options: DigestCursorOptions & { now?: Date } = {},
): Promise<unknown> {
  const { windowStart, windowEnd } = job.data
  const start = new Date(windowStart)
  const end = new Date(windowEnd)
  if (await isCommunityActivityDigestWindowComplete(end, options)) return

  const counts = await background.getJobCounts()
  const depth = (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0)
  if (depth > getPagedDispatchLimit('background_max_depth')) {
    return processRetainedSweep(job, async () => ({ hasMore: true }), {
      resumeAt: Date.now() + getPagedDispatchLimit('notifications_backoff_ms'),
    })
  }

  return processRetainedSweep<CommunityActivityDigestDispatchData, { hasMore: boolean }>(
    job,
    async save => {
      const result = await createCommunityActivityDigestBatch({
        windowStart: start,
        windowEnd: end,
        afterUserId: job.data.afterUserId,
        userIds,
        batchSize,
        now: options.now,
      })
      await enqueueBulkDeliverNotificationPushIntents(
        result.created.map(item => ({ userId: item.userId, notificationId: item.notificationId })),
      )
      if (result.nextUserId) {
        await save({ ...job.data, afterUserId: result.nextUserId })
        return { hasMore: true }
      }
      // A later window can finish before a failed predecessor. The next tick reactivates it.
      await advanceCommunityActivityDigestCursor(start, end, options)
      return { hasMore: false }
    },
  )
}
