import { hackerNewsQueueConfig, hackerNewsQueueMaxValues } from '@queues/hacker-news/config'
import { defineBoundedWorkNamespace } from './registry-bounded-work-entry.mts'

export const hackerNewsRegistryEntries = [
  defineBoundedWorkNamespace({
    namespace: 'hacker-news-queue-config',
    config: hackerNewsQueueConfig,
    label: 'Hacker News lookup queue',
    maxValues: hackerNewsQueueMaxValues,
    descriptions: { enqueue_batch_size: 'Maximum lookup jobs admitted in each bulk enqueue.' },
  }),
]
