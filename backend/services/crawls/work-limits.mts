import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

export const crawlDispatchConfig = new DynamicConfig({
  key: 'crawl-dispatch-work-config',
  fieldTypes: {
    batch_size: 'number',
    max_rows_per_run: 'number',
    hostname_batch_size: 'number',
    weekly_refresh_batch_size: 'number',
  },
  defaultFields: {
    batch_size: 1000,
    max_rows_per_run: 20000,
    hostname_batch_size: 1000,
    weekly_refresh_batch_size: 500,
  },
})

export function getCrawlDispatchLimits() {
  return {
    batchSize: getBoundedPositiveIntegerField(crawlDispatchConfig, 'batch_size', {
      defaultValue: 1000,
      maxValue: 5000,
    }),
    maxRows: getBoundedPositiveIntegerField(crawlDispatchConfig, 'max_rows_per_run', {
      defaultValue: 20000,
      maxValue: 100000,
    }),
  }
}

export function getCrawlHostnameBatchSize() {
  return getBoundedPositiveIntegerField(crawlDispatchConfig, 'hostname_batch_size', {
    defaultValue: 1000,
    maxValue: 5000,
  })
}

export function getWeeklyHostnameRefreshBatchSize() {
  return getBoundedPositiveIntegerField(crawlDispatchConfig, 'weekly_refresh_batch_size', {
    defaultValue: 500,
    maxValue: 5000,
  })
}
