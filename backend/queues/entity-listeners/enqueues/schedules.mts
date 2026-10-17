import { ENQUEUE_BASE_DEFAULTS } from '@data-stores/valkey-glide-mq'
import {
  defineScheduledJobManifest,
  toSchedulerTemplateOptions,
} from '@modules/scheduled-job-manifest'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import { ENTITY_LISTENERS_ENQUEUE_RECONCILE_ENTITIES_JOB } from '@queues/background/enqueues/entity-listeners-jobs'
import { getEntityListenerReconciliationIntervalSeconds } from '../config.mts'

export const scheduledJobManifest = defineScheduledJobManifest(BACKGROUND_QUEUE_NAME, [
  {
    schedulerId: 'entityListenerReconciliation',
    repeat: () => ({ every: getEntityListenerReconciliationIntervalSeconds() * 1000 }),
    template: {
      name: ENTITY_LISTENERS_ENQUEUE_RECONCILE_ENTITIES_JOB.name,
      data: {},
      opts: toSchedulerTemplateOptions({
        ...ENQUEUE_BASE_DEFAULTS,
        ...ENTITY_LISTENERS_ENQUEUE_RECONCILE_ENTITIES_JOB.options,
      }),
    },
    operatorSurfaces: [{ kind: 'backfill', backfillId: 'entity-listener-reconciliation' }],
  },
])
