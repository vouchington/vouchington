import { boundRateLimitDeferral } from '@modules/queue-errors'
import type { Job } from 'glide-mq'
import type {
  DeliverActivityData,
  DistributeActivityData,
} from '@queues/background/enqueues/activitypub-domain'
import type { deliverActivityToInbox } from '@services/activitypub-delivery'
import { distributeActivity, deliverActivity } from './processors/delivery.mts'

export async function processDistributeActivityJob(
  job: Pick<Job<DistributeActivityData>, 'data' | 'moveToDelayed'>,
): Promise<unknown> {
  const result = await distributeActivity(job.data)
  if (result.retryAfterMs !== undefined) {
    await job.moveToDelayed(Date.now() + result.retryAfterMs)
  }
  return result
}

export async function processDeliverActivityJob(
  job: Pick<Job<DeliverActivityData>, 'data' | 'timestamp' | 'moveToDelayed'>,
  dependencies: { deliverActivityToInbox?: typeof deliverActivityToInbox } = {},
): Promise<unknown> {
  return boundRateLimitDeferral(job, async () =>
    deliverActivity(job.data, dependencies.deliverActivityToInbox ? dependencies : {}),
  )
}
