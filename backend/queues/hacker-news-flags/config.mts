import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export const QUEUE_NAME = 'hacker-news-flags'
export const FLAG_JOB = 'refreshHackerNewsFlags'
export const REPAIR_JOB = 'repairHackerNewsFlags'
const defaults = {
  batch_size: 100,
  repair_interval_seconds: 86400,
  url_concurrency: 1,
  repair_concurrency: 1,
}
export const hackerNewsFlagsMaxValues = {
  batch_size: 1000,
  repair_interval_seconds: 604800,
  url_concurrency: 8,
  repair_concurrency: 8,
}
export const hackerNewsFlagsConfig = new DynamicConfig({
  key: 'hacker-news-flags-config',
  fieldTypes: {
    batch_size: 'number',
    repair_interval_seconds: 'number',
    url_concurrency: 'number',
    repair_concurrency: 'number',
  },
  defaultFields: defaults,
})
export function getHackerNewsFlagsLimit(field: keyof typeof defaults): number {
  return getBoundedPositiveIntegerField(hackerNewsFlagsConfig, field, {
    defaultValue: defaults[field],
    maxValue: hackerNewsFlagsMaxValues[field],
  })
}
export function getHackerNewsFlagsOrdering(lane: 'url' | 'repair') {
  return {
    key: `hacker-news-flags:${lane}`,
    concurrency: getHackerNewsFlagsLimit(lane === 'url' ? 'url_concurrency' : 'repair_concurrency'),
  }
}
