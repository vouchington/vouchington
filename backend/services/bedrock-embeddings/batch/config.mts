import { DynamicConfig } from '@data-stores/valkey'

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
    backlog_threshold: 'number',
    stale_ttl_hours: 'number',
  },
  defaultFields: DEFAULTS,
})

function positiveInteger(
  fields: ReturnType<typeof bedrockEmbeddingsBatchConfig.getFields>,
  field: keyof typeof DEFAULTS,
): number {
  const value = fields[field]
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= BEDROCK_BATCH_MAX_VALUES[field]
    ? value
    : DEFAULTS[field]
}

export function getRateLimitConfig(): RateLimitConfig {
  const fields = bedrockEmbeddingsBatchConfig.getFields()
  const pi = (field: keyof typeof DEFAULTS) => positiveInteger(fields, field)
  return {
    MAX_INFLIGHT_JOBS: pi('max_inflight_jobs'),
    MAX_REQUESTS_PER_HOUR: pi('max_requests_per_hour'),
    MAX_REQUESTS_PER_BATCH: pi('max_requests_per_file'),
    MAX_BATCH_SIZE_MB: pi('max_file_size_gb') * 1024,
    MAX_INFLIGHT_SIZE_MB: pi('max_job_size_gb') * 1024,
    MIN_RECORDS_PER_JOB: pi('min_records_per_job'),
  }
}

export function getBacklogThreshold(): number {
  return positiveInteger(bedrockEmbeddingsBatchConfig.getFields(), 'backlog_threshold')
}

export function getStaleTtlHours(): number {
  return positiveInteger(bedrockEmbeddingsBatchConfig.getFields(), 'stale_ttl_hours')
}
