import { createBulkEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import {
  MEMBERSHIP_PAUSE_COLLECTION_INTERVAL_MS,
  PRIORITY_DEFAULT,
  PRIORITY_DISPATCHER,
  QUEUE_NAME,
} from '../config.mts'
import { memberships } from '../queues.mts'
import type { MembershipsJobs, SyncMembershipPauseCollectionData } from '../types.mts'

import { createMembershipEnqueueFunction } from './typed-job.mts'

const DISPATCH_JOB_NAME = 'dispatchMembershipPauseCollection' satisfies MembershipsJobs
const SYNC_JOB_NAME = 'syncMembershipPauseCollection' satisfies MembershipsJobs

const enqueueDispatchJob = createMembershipEnqueueFunction(DISPATCH_JOB_NAME)
const SYNC_DEFAULTS = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
} satisfies Partial<JobOptions>
const enqueueSyncJob = createMembershipEnqueueFunction(SYNC_JOB_NAME, SYNC_DEFAULTS)

function enqueueDispatchMembershipPauseCollection(): EnqueueReturnType {
  const bucket = Math.floor(Date.now() / MEMBERSHIP_PAUSE_COLLECTION_INTERVAL_MS)
  return enqueueDispatchJob({}, {
    jobId: `membership-pause-collection-dispatch__${bucket}`,
    priority: PRIORITY_DISPATCHER,
    deduplication: {
      id: 'membership-pause-collection-dispatch',
      mode: 'throttle',
      ttl: MEMBERSHIP_PAUSE_COLLECTION_INTERVAL_MS,
    },
  } satisfies Partial<JobOptions>)
}

export const pauseCollectionSchedule = {
  schedulerId: DISPATCH_JOB_NAME,
  repeat: { every: MEMBERSHIP_PAUSE_COLLECTION_INTERVAL_MS },
  template: {
    name: DISPATCH_JOB_NAME,
    data: {},
    opts: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
      removeOnComplete: 100,
      removeOnFail: 100,
      priority: PRIORITY_DISPATCHER,
    } satisfies JobOptions,
  },
  operatorSurfaces: [
    {
      kind: 'scheduled-jobs',
      id: DISPATCH_JOB_NAME,
      schedule: 'every 1m',
      description: 'Recover Stripe pause-collection work lost after a suspension change',
      trigger: enqueueDispatchMembershipPauseCollection,
    },
  ],
} as const

/** The job id includes the generation so a newer suspension is not dropped. */
function buildSyncJob(data: SyncMembershipPauseCollectionData) {
  const generation = data.leaseToken ?? 'pending'
  const requestedAtMs = Date.parse(data.requestedAt)
  const jobId = `membership-pause-collection__${data.userId}__${requestedAtMs}__${generation}`
  return {
    data,
    opts: {
      jobId,
      priority: PRIORITY_DEFAULT,
      deduplication: { id: jobId, mode: 'simple' },
      ordering: { key: `pause-collection:${data.userId}`, concurrency: 1 },
    } satisfies Partial<JobOptions>,
  }
}

const enqueueBulkSyncJobs = createBulkEnqueueFunction({
  queue: memberships,
  queueName: QUEUE_NAME,
  jobName: SYNC_JOB_NAME,
  defaults: SYNC_DEFAULTS,
  buildJob: buildSyncJob,
})

/** The work rows are already committed; one call adds every lease's sync job. */
export function enqueueBulkSyncMembershipPauseCollection(
  leases: readonly SyncMembershipPauseCollectionData[],
) {
  return enqueueBulkSyncJobs([...leases])
}

/** The work row is already committed. */
export function enqueueSyncMembershipPauseCollection(
  data: SyncMembershipPauseCollectionData,
): EnqueueReturnType {
  const job = buildSyncJob(data)
  return enqueueSyncJob(job.data, job.opts)
}
