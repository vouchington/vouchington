import { hackerNewsQueueConfig, hackerNewsQueueMaxValues } from '@queues/hacker-news/config'
import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'

export const hackerNewsRegistryEntries = [
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
