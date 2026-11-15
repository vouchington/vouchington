import {
  voteDriftQueueConfig,
  VOTE_DRIFT_CONCURRENCY_MAX,
} from '@queues/psql/enqueues/vote-drift-config'
import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'

export const moderationDiagnosticsRegistryEntries = [
  defineDynamicConfigNamespace({
    namespace: 'vote-drift-queue-config',
    label: 'Vote drift queue',
    description: 'Bounds concurrent diagnostic reconciliation pages.',
    config: voteDriftQueueConfig,
    access: { update_roles: ['developer'] },
    fields: {
      concurrency: {
        description: 'Global concurrent diagnostic reconciliation pages.',
        minValue: 1,
        maxValue: VOTE_DRIFT_CONCURRENCY_MAX,
        integer: true,
      },
    },
  }),
]
