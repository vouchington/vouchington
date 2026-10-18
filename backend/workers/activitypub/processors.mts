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
import type { deliverActivityToInbox } from '@services/activitypub-delivery'
import { distributeActivity, deliverActivity } from './processors/delivery.mts'

export async function processDistributeActivityJob(
  job: Pick<Job<DistributeActivityData>, 'data' | 'id' | 'name' | 'updateData' | 'moveToDelayed'>,
): Promise<unknown> {
  return processPagedDispatcher(job, {
    dispatcher: 'activitypub',
    cursorKey: 'remoteActorId',
    target: background,
    targetName: 'background',
    readAndDispatch: async pageSize => {
      const result = await distributeActivity(job.data, undefined, pageSize)
      if (result.stale) return job.moveToDelayed(Date.now())
      if (result.retryAfterMs !== undefined)
        await job.moveToDelayed(Date.now() + result.retryAfterMs)
      return {
        result,
        ...(result.completed === false
          ? { next: { ...job.data, cursor: 'cursor' in result ? result.cursor : job.data.cursor } }
          : {}),
      }
    },
    enqueueNext: createBackgroundEnqueue(ACTIVITYPUB_DISTRIBUTE_ACTIVITY_JOB),
  })
}

export async function processDeliverActivityJob(
  job: Pick<Job<DeliverActivityData>, 'data' | 'timestamp' | 'moveToDelayed'>,
  dependencies: { deliverActivityToInbox?: typeof deliverActivityToInbox } = {},
): Promise<unknown> {
  return boundRateLimitDeferral(job, async () =>
    deliverActivity(job.data, dependencies.deliverActivityToInbox ? dependencies : {}),
  )
}
