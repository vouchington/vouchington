import { psqlQueueConfig, TERMINAL_ACTIVITY_RETENTION_ORDERING_MAX } from '@queues/psql/config'
import { defineBoundedWorkNamespace } from './registry-bounded-work-entry.mts'

export const psqlQueueRegistryEntry = defineBoundedWorkNamespace({
  namespace: 'psql-queue-config',
  config: psqlQueueConfig,
  label: 'PostgreSQL terminal activity retention',
  maxValues: { terminal_activity_retention_concurrency: TERMINAL_ACTIVITY_RETENTION_ORDERING_MAX },
  descriptions: {
    terminal_activity_retention_concurrency:
      'Global concurrent retained jobs per terminal Follow or Like family.',
  },
})
