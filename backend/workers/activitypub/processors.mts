import { boundRateLimitDeferral } from '@vouchington/queue-errors'
import { processPagedDispatcher } from '@data-stores/valkey-glide-mq/paged-dispatcher'
import { background } from '@queues/background/queues'
import { createBackgroundEnqueue } from '@queues/background/enqueues'
import { ACTIVITYPUB_DISTRIBUTE_ACTIVITY_JOB } from '@queues/background/enqueues/activitypub-jobs'
import type { Job } from 'glide-mq'
import type {
  DeliverActivityData,
  DistributeActivityData,
} from '@queues/background/enqueues/activitypub-domain'
import {
  distributionPageJobId,
  enqueueBulkDistributeActivity,
} from '@queues/activitypub/enqueues/delivery'
import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import {
  markActivityDistributionComplete,
  type deliverActivityToInbox,
} from '@services/activitypub-delivery'
import { distributeActivity, deliverActivity } from './processors/delivery.mts'

export async function processDistributeActivityJob(
  job: Pick<Job<DistributeActivityData>, 'data' | 'id' | 'name' | 'updateData' | 'moveToDelayed'>,
): Promise<unknown> {
  const result = await processPagedDispatcher(job, {
    dispatcher: 'activitypub',
    cursorKey: 'remoteActorId',
    target: background,
    targetName: 'background',
    readAndDispatch: async pageSize => {
      const result = await distributeActivity(job.data, undefined, pageSize)
      return {
        result,
        ...(!result.completed
          ? {
              next: nextDistributionPage(
                job.data,
                'cursor' in result ? result.cursor : job.data.cursor,
              ),
            }
          : {}),
      }
    },
    continuationJobId: distributionPageJobId,
    enqueueNext: createBackgroundEnqueue(ACTIVITYPUB_DISTRIBUTE_ACTIVITY_JOB),
  })
  // A root receipt may say its continuation was admitted even if that continuation later
  // failed or was pruned. Recovery walks the retained receipt chain and rearms terminal children
  // through GlideMQ's WATCH-fenced native removal; a live child remains the canonical worker.
  if (job.data.recovery && !result.completed && 'cursor' in result && result.cursor) {
    const next = nextDistributionPage(job.data, result.cursor)
    await enqueueBulkReactivatingFinished({
      queue: background,
      inputs: [next],
      jobIdOf: distributionPageJobId,
      enqueueBulk: enqueueBulkDistributeActivity,
    })
  }
  if (result.completed) await markActivityDistributionComplete(job.data)
  return result
}

function nextDistributionPage(
  data: DistributeActivityData,
  cursor: string | undefined,
): DistributeActivityData {
  const base = {
    activityId: data.activityId,
    sourceUserId: data.sourceUserId,
    cursor,
    ...(data.recovery ? { recovery: true as const } : {}),
  }
  switch (data.activityType) {
    case 'Follow':
      return { ...base, activityType: 'Follow', targetUserId: data.targetUserId }
    case 'UndoFollow':
      return {
        ...base,
        activityType: 'UndoFollow',
        targetUserId: data.targetUserId,
        originalActivityId: data.originalActivityId,
      }
    case 'Like':
      return { ...base, activityType: 'Like', targetPostId: data.targetPostId }
    case 'UndoLike':
      return {
        ...base,
        activityType: 'UndoLike',
        targetPostId: data.targetPostId,
        originalActivityId: data.originalActivityId,
      }
  }
}

export async function processDeliverActivityJob(
  job: Pick<Job<DeliverActivityData>, 'data' | 'timestamp' | 'moveToDelayed'>,
  dependencies: { deliverActivityToInbox?: typeof deliverActivityToInbox } = {},
): Promise<unknown> {
  return boundRateLimitDeferral(job, async () =>
    deliverActivity(job.data, dependencies.deliverActivityToInbox ? dependencies : {}),
  )
}
