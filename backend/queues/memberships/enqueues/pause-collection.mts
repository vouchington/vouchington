import { createBackgroundEnqueue } from '@queues/background/enqueues'
import {
  MEMBERSHIPS_PAUSE_COLLECTION_DISPATCH_JOB,
  MEMBERSHIPS_PAUSE_COLLECTION_SYNC_JOB,
} from '@queues/background/enqueues/memberships-jobs-2'
import type { SyncMembershipPauseCollectionData } from '@queues/background/enqueues/memberships-domain'
import { toSchedulerTemplateOptions } from '@modules/scheduled-job-manifest'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { MEMBERSHIP_PAUSE_COLLECTION_INTERVAL_MS } from '../config.mts'
import { membershipOrdering } from './ordering.mts'

const INTERVAL_MS = MEMBERSHIP_PAUSE_COLLECTION_INTERVAL_MS

const enqueueDispatchJob = createBackgroundEnqueue(MEMBERSHIPS_PAUSE_COLLECTION_DISPATCH_JOB)
const enqueueSyncJob = createBackgroundEnqueue(MEMBERSHIPS_PAUSE_COLLECTION_SYNC_JOB)

function enqueueDispatchMembershipPauseCollection(): EnqueueReturnType {
  const bucket = Math.floor(Date.now() / INTERVAL_MS)
  return enqueueDispatchJob({}, {
    jobId: `membership-pause-collection-dispatch__${bucket}`,
    deduplication: {
      id: 'membership-pause-collection-dispatch',
      mode: 'throttle',
      ttl: INTERVAL_MS,
    },
  } satisfies Partial<JobOptions>)
}

export const pauseCollectionSchedule = {
  schedulerId: 'dispatchMembershipPauseCollection',
  repeat: { every: INTERVAL_MS },
  template: {
    name: MEMBERSHIPS_PAUSE_COLLECTION_DISPATCH_JOB.name,
    data: {},
    opts: toSchedulerTemplateOptions({ ...MEMBERSHIPS_PAUSE_COLLECTION_DISPATCH_JOB.options }),
  },
  operatorSurfaces: [
    {
      kind: 'scheduled-jobs',
      id: 'dispatchMembershipPauseCollection',
      schedule: 'every 1m',
      description: 'Recover Stripe pause-collection work lost after a suspension change',
      trigger: enqueueDispatchMembershipPauseCollection,
    },
  ],
} as const

/** The work row is already committed. The job id includes the generation so a newer one is not dropped. */
export function enqueueSyncMembershipPauseCollection(
  data: SyncMembershipPauseCollectionData,
): EnqueueReturnType {
  const generation = data.leaseToken ?? 'pending'
  const requestedAtMs = Date.parse(data.requestedAt)
  const jobId = `membership-pause-collection__${data.userId}__${requestedAtMs}__${generation}`
  return enqueueSyncJob(data, {
    jobId,
    deduplication: { id: jobId, mode: 'simple' },
    ordering: membershipOrdering(`pause-collection:${data.userId}`),
  } satisfies Partial<JobOptions>)
}
