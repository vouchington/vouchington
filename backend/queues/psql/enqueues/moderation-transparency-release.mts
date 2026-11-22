import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { ScheduledJobManifest } from '@modules/scheduled-job-manifest'
import type { JobOptions } from 'glide-mq'
import { PRIORITY_DEFAULT, PSQL_RETRY_OPTIONS, QUEUE_NAME } from '../config.mts'
import { psql } from '../queues.mts'
import type { PsqlJobPayloads } from '../types.mts'

export const MODERATION_TRANSPARENCY_RELEASE_JOB_NAME = 'releaseModerationTransparencyDays'
export const MODERATION_TRANSPARENCY_RELEASE_SCHEDULER_ID = 'moderation-transparency-release-daily'
/** Daily just after 00:00 UTC, when the newest day becomes releasable. */
export const MODERATION_TRANSPARENCY_RELEASE_CRON = '10 0 * * *'

const MODERATION_TRANSPARENCY_RELEASE_OPTIONS = {
  ...PSQL_RETRY_OPTIONS,
  priority: PRIORITY_DEFAULT,
  removeOnComplete: 100,
  removeOnFail: 100,
  ordering: { key: 'psql:moderation-transparency-release', concurrency: 1 },
} satisfies JobOptions

const enqueueRelease = createEnqueueFunction<
  PsqlJobPayloads[typeof MODERATION_TRANSPARENCY_RELEASE_JOB_NAME],
  typeof MODERATION_TRANSPARENCY_RELEASE_JOB_NAME
>({
  queue: psql,
  queueName: QUEUE_NAME,
  jobName: MODERATION_TRANSPARENCY_RELEASE_JOB_NAME,
})

export const enqueueModerationTransparencyRelease = () =>
  enqueueRelease({}, MODERATION_TRANSPARENCY_RELEASE_OPTIONS)

export const moderationTransparencyReleaseSchedule = {
  schedulerId: MODERATION_TRANSPARENCY_RELEASE_SCHEDULER_ID,
  repeat: { pattern: MODERATION_TRANSPARENCY_RELEASE_CRON },
  template: {
    name: MODERATION_TRANSPARENCY_RELEASE_JOB_NAME,
    data: {} satisfies PsqlJobPayloads[typeof MODERATION_TRANSPARENCY_RELEASE_JOB_NAME],
    opts: MODERATION_TRANSPARENCY_RELEASE_OPTIONS,
  },
  environment: 'deployed',
  operatorSurfaces: [
    {
      kind: 'scheduled-jobs',
      id: MODERATION_TRANSPARENCY_RELEASE_SCHEDULER_ID,
      schedule: MODERATION_TRANSPARENCY_RELEASE_CRON,
      description: 'Release closed daily moderation transparency cohorts computed from source rows',
      trigger: enqueueModerationTransparencyRelease,
    },
  ],
} satisfies ScheduledJobManifest['jobs'][number]
