import { boundRateLimitDeferral } from '@modules/queue-errors'
import type { Job } from 'glide-mq'
import type { DistributeActivityData } from '@queues/activitypub/enqueues/delivery'
import type { deliverActivityToInbox } from '@services/activitypub-delivery'
import { distributeActivity, deliverActivity } from './processors/delivery.mts'
import { processActivityPubInboxJob } from './processors/inbox-job.mts'

export async function processActivityPubJob(
  job: Job,
  dependencies: { deliverActivityToInbox?: typeof deliverActivityToInbox } = {},
): Promise<unknown> {
  if (job.name === 'distributeActivity') {
    const result = await distributeActivity(job.data as DistributeActivityData)
    if (result.retryAfterMs !== undefined) {
      await job.moveToDelayed(Date.now() + result.retryAfterMs)
    }
    return result
  }
  if (job.name === 'deliverActivity') {
    return boundRateLimitDeferral(job, async () =>
      deliverActivity(job.data as never, dependencies.deliverActivityToInbox ? dependencies : {}),
    )
  }
  return processActivityPubInboxJob(job)
}
