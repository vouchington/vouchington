import { createBackgroundEnqueue } from '@queues/background/enqueues'
import { ACTIVITYPUB_PROCESS_DELIVERY_JOB } from '@queues/background/enqueues/activitypub-jobs'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import type { ActivityPubInboxDeliveryJob } from '../types.mts'

const enqueueDeliveryJob = createBackgroundEnqueue(ACTIVITYPUB_PROCESS_DELIVERY_JOB)

export function enqueueActivityPubInboxDelivery(
  data: ActivityPubInboxDeliveryJob,
): EnqueueReturnType {
  const jobId = `activitypub-inbox__${data.requestDigest}`
  return enqueueDeliveryJob(data, {
    jobId,
    deduplication: { id: jobId, mode: 'simple' },
  } satisfies Partial<JobOptions>)
}
