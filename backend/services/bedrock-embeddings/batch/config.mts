import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

export type RateLimitConfig = {
  MAX_INFLIGHT_JOBS: number
  MAX_REQUESTS_PER_HOUR: number
  MAX_REQUESTS_PER_BATCH: number
  MAX_BATCH_SIZE_MB: number
  MAX_INFLIGHT_SIZE_MB: number
  MIN_RECORDS_PER_JOB: number
}

const DEFAULTS = {
  max_inflight_jobs: 100,
  max_requests_per_hour: 100000,
  max_requests_per_file: 100000,
  // Stored in GB; converted to MB in getRateLimitConfig()
  max_file_size_gb: 1,
  max_job_size_gb: 100,
  min_records_per_job: 100,
  cursor_batch_size: 1000,
  image_cursor_batch_size: 100,
  max_scan_rows_per_run: 100000,
  backlog_threshold: 1000,
  stale_ttl_hours: 24,
}

export const BEDROCK_BATCH_MAX_VALUES: Record<keyof typeof DEFAULTS, number> = {
  max_inflight_jobs: 10_000,
  max_requests_per_hour: 100_000_000,
  max_requests_per_file: 1_000_000,
  max_file_size_gb: 10,
  max_job_size_gb: 1_000,
  min_records_per_job: 1_000_000,
  cursor_batch_size: 5000,
  image_cursor_batch_size: 5000,
  max_scan_rows_per_run: 1_000_000,
  backlog_threshold: 10_000_000,
  stale_ttl_hours: 168,
}

export const bedrockEmbeddingsBatchConfig = new DynamicConfig({
  key: 'bedrock-embeddings-batch-config',
  fieldTypes: {
    max_inflight_jobs: 'number',
    max_requests_per_hour: 'number',
    max_requests_per_file: 'number',
    max_file_size_gb: 'number',
    max_job_size_gb: 'number',
    min_records_per_job: 'number',
    cursor_batch_size: 'number',
    image_cursor_batch_size: 'number',
    max_scan_rows_per_run: 'number',
    backlog_threshold: 'number',
    stale_ttl_hours: 'number',
  },
  defaultFields: DEFAULTS,
})

function positiveInteger(field: keyof typeof DEFAULTS): number {
  return getBoundedPositiveIntegerField(bedrockEmbeddingsBatchConfig, field, {
    defaultValue: DEFAULTS[field],
    maxValue: BEDROCK_BATCH_MAX_VALUES[field],
  })
}

export function getRateLimitConfig(): RateLimitConfig {
  return {
    MAX_INFLIGHT_JOBS: positiveInteger('max_inflight_jobs'),
    MAX_REQUESTS_PER_HOUR: positiveInteger('max_requests_per_hour'),
    MAX_REQUESTS_PER_BATCH: positiveInteger('max_requests_per_file'),
    MAX_BATCH_SIZE_MB: positiveInteger('max_file_size_gb') * 1024,
    MAX_INFLIGHT_SIZE_MB: positiveInteger('max_job_size_gb') * 1024,
    MIN_RECORDS_PER_JOB: positiveInteger('min_records_per_job'),
  }
}

export function getBacklogThreshold(): number {
  return positiveInteger('backlog_threshold')
}

export function getStaleTtlHours(): number {
  return positiveInteger('stale_ttl_hours')
}

export function getPendingEmbeddingScanLimits(images = false) {
  const maxRows = positiveInteger('max_scan_rows_per_run')
  if (maxRows < positiveInteger('min_records_per_job'))
    throw new RangeError('Embedding scan budget must cover the minimum records per job')
  return {
    batchSize: positiveInteger(images ? 'image_cursor_batch_size' : 'cursor_batch_size'),
    maxRows,
  }
}
