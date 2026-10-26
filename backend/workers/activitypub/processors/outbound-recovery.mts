import type { Job } from 'glide-mq'
import { processPagedDispatcher } from '@data-stores/valkey-glide-mq/paged-dispatcher'
import { background } from '@queues/background/queues'
import { createBackgroundEnqueue } from '@queues/background/enqueues'
import { ACTIVITYPUB_RECOVER_OUTBOUND_JOB } from '@queues/background/enqueues/activitypub-jobs'
import type {
  RecoverOutboundDistributionData,
  DistributeActivityData,
} from '@queues/background/enqueues/activitypub-domain'
import {
  enqueueBulkDistributeActivity,
  getUndoFollowActivityId,
} from '@queues/activitypub/enqueues/delivery'
import {
  listPendingOutboundDistributionPage,
  type OutboundRecoveryRow,
} from '@services/activitypub-delivery'

const enqueueRecoveryContinuation = createBackgroundEnqueue(ACTIVITYPUB_RECOVER_OUTBOUND_JOB)

export async function processRecoverOutboundDistributionJob(
  job: Pick<
    Job<RecoverOutboundDistributionData>,
    'data' | 'id' | 'name' | 'updateData' | 'moveToDelayed'
  >,
): Promise<{ scanned: number; hasMore: boolean }> {
  return processPagedDispatcher(job, {
    dispatcher: 'activitypub',
    cursorKey: 'lane,id',
    target: background,
    targetName: 'background',
    readAndDispatch: async pageSize => {
      const page = await listPendingOutboundDistributionPage(
        job.data.source,
        job.data.cursor,
        pageSize,
        job.data.throughPostId,
      )
      if (page.rows.length > 0) {
        await enqueueBulkDistributeActivity(page.rows.map(toDistributionJob))
      }
      return {
        result: { scanned: page.rows.length, hasMore: page.next !== undefined },
        ...(page.next
          ? {
              next: {
                source: job.data.source,
                cursor: page.next,
                ...(page.throughPostId ? { throughPostId: page.throughPostId } : {}),
              },
            }
          : {}),
      }
    },
    enqueueNext: enqueueRecoveryContinuation,
  })
}

function toDistributionJob(row: OutboundRecoveryRow): DistributeActivityData {
  if (row.source === 'votes') {
    if (row.originalLikeActivityId) {
      return {
        activityType: 'UndoLike',
        activityId: row.activityId,
        originalActivityId: row.originalLikeActivityId,
        sourceUserId: row.sourceUserId,
        targetPostId: row.targetPostId,
        recovery: true,
      }
    }
    return {
      activityType: 'Like',
      activityId: row.activityId,
      sourceUserId: row.sourceUserId,
      targetPostId: row.targetPostId,
      recovery: true,
    }
  }
  if (row.deleted) {
    return {
      activityType: 'UndoFollow',
      activityId: getUndoFollowActivityId(row.originalFollowActivityId),
      originalActivityId: row.originalFollowActivityId,
      sourceUserId: row.sourceUserId,
      targetUserId: row.targetUserId,
      recovery: true,
    }
  }
  return {
    activityType: 'Follow',
    activityId: row.originalFollowActivityId,
    sourceUserId: row.sourceUserId,
    targetUserId: row.targetUserId,
    recovery: true,
  }
}
