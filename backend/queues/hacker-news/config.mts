import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export const QUEUE_NAME = 'hacker-news'
export const HACKER_NEWS_JOB = 'lookupHackerNewsReferences'

const defaultFields = { enqueue_batch_size: 1000, lookups_enabled: true }
export const hackerNewsQueueMaxValues = { enqueue_batch_size: 10000 }
export const hackerNewsQueueConfig = new DynamicConfig({
  key: 'hacker-news-queue-config',
  fieldTypes: { enqueue_batch_size: 'number', lookups_enabled: 'boolean' },
  defaultFields,
})
export function getHackerNewsEnqueueBatchSize(): number {
  return getBoundedPositiveIntegerField(hackerNewsQueueConfig, 'enqueue_batch_size', {
    defaultValue: defaultFields.enqueue_batch_size,
    maxValue: hackerNewsQueueMaxValues.enqueue_batch_size,
  })
}

/** The pulling switch does not affect visibility or retention. */
export function areHackerNewsLookupsEnabled(): boolean {
  const enabled = hackerNewsQueueConfig.fields.get('lookups_enabled')
  return typeof enabled === 'boolean' ? enabled : defaultFields.lookups_enabled
}
