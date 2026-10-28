import { defineScheduledJobManifest } from '@modules/scheduled-job-manifest'
import { toSchedulerTemplateOptions } from '@vouchington/worker-runtime/schedule-manifest'
import { BACKGROUND_QUEUE_NAME } from '../config.mts'
import { TOPIC_MERGE_RECOVER_JOB } from './topic-merge-jobs.mts'
import { enqueueTopicMergeRecovery } from './topic-merge-enqueues.mts'

export const scheduledJobManifest = defineScheduledJobManifest(BACKGROUND_QUEUE_NAME, [
  {
    schedulerId: 'topic-merge-recover-stalled',
    repeat: { pattern: '*/5 * * * *' },
    template: {
      name: TOPIC_MERGE_RECOVER_JOB.name,
      data: {},
      opts: toSchedulerTemplateOptions(TOPIC_MERGE_RECOVER_JOB.options),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'topic-merge-recover-stalled',
        schedule: '*/5 * * * *',
        description: 'Re-enqueue stalled staged topic merges',
        trigger: enqueueTopicMergeRecovery,
      },
    ],
  },
])
