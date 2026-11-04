import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = {
  hits_per_page: 100,
  write_batch_size: 200,
  request_timeout_ms: 10_000,
  retention_days: 180,
  retention_batch_size: 500,
  retention_max_batches: 20,
}

/** Hard ceilings for the current runtime configuration contract. */
export const hackerNewsWorkMaxValues = {
  hits_per_page: 1000,
  write_batch_size: 1000,
  request_timeout_ms: 60_000,
  retention_days: 3650,
  retention_batch_size: 5000,
  retention_max_batches: 200,
}

export const hackerNewsWorkConfig = new DynamicConfig({
  key: 'hacker-news-work-config',
  fieldTypes: {
    hits_per_page: 'number',
    write_batch_size: 'number',
    request_timeout_ms: 'number',
    retention_days: 'number',
    retention_batch_size: 'number',
    retention_max_batches: 'number',
  },
  defaultFields,
})

export function getHackerNewsWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(hackerNewsWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: hackerNewsWorkMaxValues[field],
  })
}
