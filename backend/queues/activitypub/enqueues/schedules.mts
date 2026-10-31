import { defineScheduledJobManifest } from '@modules/scheduled-job-manifest'
import { toSchedulerTemplateOptions } from '@vouchington/worker-runtime/schedule-manifest'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import { ACTIVITYPUB_RECOVER_OUTBOUND_JOB } from '@queues/background/enqueues/activitypub-jobs'
import { RECOVERY_INTERVAL_MS } from '../config.mts'
import { enqueueRecoverOutboundDistribution } from './outbound-recovery.mts'

export const scheduledJobManifest = defineScheduledJobManifest(BACKGROUND_QUEUE_NAME, [
  ...(['follows', 'votes'] as const).map(source => ({
    schedulerId: `activitypub-outbound-${source}-recovery`,
    repeat: { every: RECOVERY_INTERVAL_MS },
    template: {
      name: ACTIVITYPUB_RECOVER_OUTBOUND_JOB.name,
      data: { source },
      opts: toSchedulerTemplateOptions({ ...ACTIVITYPUB_RECOVER_OUTBOUND_JOB.options }),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs' as const,
        id: `activitypub-outbound-${source}-recovery`,
        schedule: 'every 5m',
        description: `Recover pending outbound ActivityPub ${source} distribution`,
        trigger: () => enqueueRecoverOutboundDistribution(source),
      },
    ] as const,
  })),
])
