import { hackerNewsQueueConfig, hackerNewsQueueMaxValues } from '@queues/hacker-news/config'
import { hackerNewsFlagsConfig, hackerNewsFlagsMaxValues } from '@queues/hacker-news-flags/config'
import { defineBoundedWorkNamespace } from './registry-bounded-work-entry.mts'
import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'

export const hackerNewsRegistryEntries = [
  defineBoundedWorkNamespace({
    namespace: 'hacker-news-flags-config',
    config: hackerNewsFlagsConfig,
    label: 'Hacker News flag maintenance',
    maxValues: hackerNewsFlagsMaxValues,
    descriptions: {
      batch_size: 'Maximum entities rechecked per maintenance page.',
      repair_interval_seconds: 'Interval between flag repair runs.',
      url_concurrency: 'Global concurrency for URL-triggered flag maintenance.',
      repair_concurrency: 'Global concurrency for flag repair.',
    },
  }),
  defineDynamicConfigNamespace({
    namespace: 'hacker-news-queue-config',
    config: hackerNewsQueueConfig,
    label: 'Hacker News lookup queue',
    description: 'Controls Hacker News lookup admission and execution.',
    access: { update_roles: ['developer'] },
    fields: {
      enqueue_batch_size: {
        description: 'Maximum lookup jobs admitted in each bulk enqueue.',
        minValue: 1,
        maxValue: hackerNewsQueueMaxValues.enqueue_batch_size,
        integer: true,
      },
      lookups_enabled: { description: 'Enable Hacker News lookups and refreshes.' },
    },
  }),
]
