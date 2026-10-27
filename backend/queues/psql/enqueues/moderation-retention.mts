import { createHash } from 'node:crypto'
import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import {
  QUEUE_NAME,
  DATA_RETENTION_CRON,
  MODERATION_RETENTION_JOB_NAME,
  MODERATION_RETENTION_SCHEDULER_ID,
  moderationRetentionQueueConfig,
  getModerationRetentionJobOptions,
} from '../config.mts'
import type { ScheduledJobManifest } from '@modules/scheduled-job-manifest'
import { psql } from '../queues.mts'
import type { ModerationRetentionJobData, PsqlJobs } from '../types.mts'

const enqueueModerationRetentionJob = createEnqueueFunction<ModerationRetentionJobData, PsqlJobs>({
  queue: psql,
  queueName: QUEUE_NAME,
  jobName: MODERATION_RETENTION_JOB_NAME,
})

export async function enqueueModerationRetentionCleanup() {
  await moderationRetentionQueueConfig.waitForInitialization()
  return enqueueModerationRetentionJob({}, getModerationRetentionJobOptions())
}

/** Retrying one receipted step reuses its child identity, distinct from the active parent. */
export async function enqueueModerationRetentionContinuation(
  data: Required<Pick<ModerationRetentionJobData, 'rootJobId' | 'hop' | 'remainingKinds'>>,
) {
  await moderationRetentionQueueConfig.waitForInitialization()
  return enqueueModerationRetentionJob(data, {
    ...getModerationRetentionJobOptions(),
    jobId: `psql__moderation-retention__${createHash('sha256').update(data.rootJobId).digest('hex')}__${data.hop}`,
  })
}

export const moderationRetentionSchedule = {
  schedulerId: MODERATION_RETENTION_SCHEDULER_ID,
  repeat: { pattern: DATA_RETENTION_CRON },
  template: {
    name: MODERATION_RETENTION_JOB_NAME,
    data: {},
    opts: getModerationRetentionJobOptions,
  },
  environment: 'deployed',
  operatorSurfaces: [
    {
      kind: 'scheduled-jobs',
      id: MODERATION_RETENTION_SCHEDULER_ID,
      schedule: DATA_RETENTION_CRON,
      description: 'Start a bounded moderation-history sweep with immediate continuation',
      trigger: enqueueModerationRetentionCleanup,
    },
  ],
} satisfies ScheduledJobManifest['jobs'][number]
