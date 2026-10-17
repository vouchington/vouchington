import { ENQUEUE_BASE_DEFAULTS } from '@data-stores/valkey-glide-mq'
import {
  defineScheduledJobManifest,
  toSchedulerTemplateOptions,
} from '@modules/scheduled-job-manifest'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import { VOTE_AGGREGATION_VOTE_WEIGHT_DISPATCHER_JOB } from '@queues/background/enqueues/vote-aggregation-jobs'
import { enqueueRecalculateVoteWeightDispatcher } from './vote-weight.mts'

export const scheduledJobManifest = defineScheduledJobManifest(BACKGROUND_QUEUE_NAME, [
  {
    schedulerId: 'dailyVoteWeightRecalculation',
    repeat: { pattern: '0 4 * * *' },
    template: {
      name: VOTE_AGGREGATION_VOTE_WEIGHT_DISPATCHER_JOB.name,
      opts: toSchedulerTemplateOptions({
        ...ENQUEUE_BASE_DEFAULTS,
        ...VOTE_AGGREGATION_VOTE_WEIGHT_DISPATCHER_JOB.options,
      }),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'dailyVoteWeightRecalculation',
        schedule: '0 4 * * *',
        description: 'Recalculate vote weights',
        trigger: enqueueRecalculateVoteWeightDispatcher,
      },
      { kind: 'backfill', backfillId: 'vote-weight-dispatch' },
    ],
  },
])
