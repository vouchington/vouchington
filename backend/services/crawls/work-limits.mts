import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export const crawlCleanupMaxValues = { batchSize: 5000, maxBatches: 100, ageDays: 365 }

export const crawlDispatchConfig = new DynamicConfig({
  key: 'crawl-dispatch-work-config',
  fieldTypes: {
    cleanup_max_batches_per_run: 'number',
    cleanup_batch_size: 'number',
    cleanup_age_days: 'number',
    batch_size: 'number',
    max_rows_per_run: 'number',
    hostname_batch_size: 'number',
    hostname_max_rows_per_run: 'number',
    weekly_refresh_batch_size: 'number',
    weekly_refresh_max_rows_per_run: 'number',
  },
  defaultFields: {
    cleanup_max_batches_per_run: 1,
    cleanup_batch_size: 500,
    cleanup_age_days: 30,
    batch_size: 1000,
    max_rows_per_run: 20000,
    hostname_batch_size: 1000,
    hostname_max_rows_per_run: 20000,
    weekly_refresh_batch_size: 500,
    weekly_refresh_max_rows_per_run: 5_000,
  },
})

export type CrawlDispatchPageLimits = {
  batchSize: number
  maxRows: number
}

const crawlDispatchBatchMax = 5000
const crawlDispatchRowsMax = 100000

export function getCrawlDispatchLimits(): CrawlDispatchPageLimits {
  return {
    batchSize: getBoundedPositiveIntegerField(crawlDispatchConfig, 'batch_size', {
      defaultValue: 1000,
      maxValue: crawlDispatchBatchMax,
    }),
    maxRows: getBoundedPositiveIntegerField(crawlDispatchConfig, 'max_rows_per_run', {
      defaultValue: 20000,
      maxValue: crawlDispatchRowsMax,
    }),
  }
}

/** Explicit limits win over the shared config, which a Valkey refresh can replace mid-run. */
export function resolveCrawlDispatchPageLimits(
  limits?: CrawlDispatchPageLimits,
): CrawlDispatchPageLimits {
  const resolved = limits ?? getCrawlDispatchLimits()
  if (
    !Number.isSafeInteger(resolved.batchSize) ||
    resolved.batchSize < 1 ||
    resolved.batchSize > crawlDispatchBatchMax ||
    !Number.isSafeInteger(resolved.maxRows) ||
    resolved.maxRows < 1 ||
    resolved.maxRows > crawlDispatchRowsMax
  )
    throw new RangeError('Crawl dispatch page limits must be positive safe integers')
  return { batchSize: resolved.batchSize, maxRows: resolved.maxRows }
}

export function getCrawlHostnameBatchSize() {
  return getBoundedPositiveIntegerField(crawlDispatchConfig, 'hostname_batch_size', {
    defaultValue: 1000,
    maxValue: 5000,
  })
}

export function getCrawlHostnameDispatchLimits() {
  return {
    batchSize: getCrawlHostnameBatchSize(),
    maxRows: getBoundedPositiveIntegerField(crawlDispatchConfig, 'hostname_max_rows_per_run', {
      defaultValue: 20000,
      maxValue: 100000,
    }),
  }
}

export function getWeeklyHostnameRefreshBatchSize() {
  return getBoundedPositiveIntegerField(crawlDispatchConfig, 'weekly_refresh_batch_size', {
    defaultValue: 500,
    maxValue: 5000,
  })
}

export function getWeeklyHostnameRefreshLimits() {
  return {
    batchSize: getWeeklyHostnameRefreshBatchSize(),
    maxRows: getBoundedPositiveIntegerField(
      crawlDispatchConfig,
      'weekly_refresh_max_rows_per_run',
      {
        defaultValue: 5_000,
        maxValue: 50_000,
      },
    ),
  }
}

export function getCrawlCleanupLimits() {
  return {
    batchSize: getBoundedPositiveIntegerField(crawlDispatchConfig, 'cleanup_batch_size', {
      defaultValue: 500,
      maxValue: crawlCleanupMaxValues.batchSize,
    }),
    maxBatches: getBoundedPositiveIntegerField(crawlDispatchConfig, 'cleanup_max_batches_per_run', {
      defaultValue: 1,
      maxValue: crawlCleanupMaxValues.maxBatches,
    }),
    ageDays: getBoundedPositiveIntegerField(crawlDispatchConfig, 'cleanup_age_days', {
      defaultValue: 30,
      maxValue: crawlCleanupMaxValues.ageDays,
    }),
  }
}
