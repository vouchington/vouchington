import type { Job, Queue } from 'glide-mq'
import { processPagedDispatcher } from '@data-stores/valkey-glide-mq/paged-dispatcher'
import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import { background } from '@queues/background/queues'
import { createBackgroundEnqueue } from '@queues/background/enqueues'
import { ACTIVITYPUB_RECOVER_OUTBOUND_JOB } from '@queues/background/enqueues/activitypub-jobs'
import type {
  RecoverOutboundDistributionData,
  DistributeActivityData,
} from '@queues/background/enqueues/activitypub-domain'
import {
  enqueueBulkDistributeActivity,
  distributionPageJobId,
  getUndoFollowActivityId,
} from '@queues/activitypub/enqueues/delivery'
import {
  listPendingOutboundDistributionPage,
  type OutboundRecoveryRow,
} from '@services/activitypub-delivery'
import { resumeDistributionPage } from './distribution-recovery.mts'

const enqueueRecoveryContinuation = createBackgroundEnqueue(ACTIVITYPUB_RECOVER_OUTBOUND_JOB)

type OutboundRecoveryDependencies = {
  queue: Pick<Queue, 'name' | 'getJobCounts'>
  enqueueBulk: typeof enqueueBulkDistributeActivity
  enqueueNext: typeof enqueueRecoveryContinuation
}

export async function processRecoverOutboundDistributionJob(
  job: Pick<
    Job<RecoverOutboundDistributionData>,
    'data' | 'id' | 'name' | 'updateData' | 'moveToDelayed'
  >,
  dependencies: Partial<OutboundRecoveryDependencies> = {},
): Promise<{ scanned: number; hasMore: boolean }> {
  const queue = dependencies.queue ?? background
  const enqueueBulk = dependencies.enqueueBulk ?? enqueueBulkDistributeActivity
  const enqueueNext = dependencies.enqueueNext ?? enqueueRecoveryContinuation
  return processPagedDispatcher(job, {
    dispatcher: 'activitypub',
    cursorKey: 'lane,id',
    target: queue,
    targetName: 'background',
    readAndDispatch: async pageSize => {
      const page = await listPendingOutboundDistributionPage(
        job.data.source,
        job.data.cursor,
        pageSize,
        job.data.throughPostId,
      )
      if (page.rows.length > 0) {
        await enqueueBulkReactivatingFinished({
          queue,
          inputs: page.rows.map(toDistributionJob),
          jobIdOf: distributionPageJobId,
          enqueueBulk,
          reactivatedInput: resumeDistributionPage,
        })
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
    enqueueNext,
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
