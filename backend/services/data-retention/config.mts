import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export type DataRetentionConfig = {
  batch_size: number
  topic_import_attempt_batch_size: number
  max_batches_per_run: number
  partition_status_probe_limit: number
  ai_retention_page_size: number
  ai_retention_max_pages_per_run: number
}

/** The per-cleanup limits one retention run applies. Every cleanup in the run takes both. */
export type DataRetentionLimits = {
  batchSize: number
  maxBatches: number
}

export const DATA_RETENTION_CONFIG_KEY = 'data-retention-config'

export const DEFAULT_DATA_RETENTION_CONFIG: DataRetentionConfig = {
  batch_size: 500,
  topic_import_attempt_batch_size: 25,
  max_batches_per_run: 200,
  partition_status_probe_limit: 64,
  ai_retention_page_size: 500,
  ai_retention_max_pages_per_run: 10,
}

export const DATA_RETENTION_MAX_VALUES: DataRetentionConfig = {
  batch_size: 5_000,
  topic_import_attempt_batch_size: 250,
  max_batches_per_run: 2_000,
  partition_status_probe_limit: 256,
  ai_retention_page_size: 500,
  ai_retention_max_pages_per_run: 10,
}

export const dataRetentionConfig = new DynamicConfig({
  key: DATA_RETENTION_CONFIG_KEY,
  fieldTypes: {
    batch_size: 'number',
    max_batches_per_run: 'number',
    topic_import_attempt_batch_size: 'number',
    partition_status_probe_limit: 'number',
    ai_retention_page_size: 'number',
    ai_retention_max_pages_per_run: 'number',
  },
  defaultFields: DEFAULT_DATA_RETENTION_CONFIG,
})

export function getDataRetentionLimits(): DataRetentionLimits {
  return {
    batchSize: readField('batch_size'),
    maxBatches: readField('max_batches_per_run'),
  }
}

function readField(field: keyof DataRetentionConfig): number {
  return getBoundedPositiveIntegerField(dataRetentionConfig, field, {
    defaultValue: DEFAULT_DATA_RETENTION_CONFIG[field],
    maxValue: DATA_RETENTION_MAX_VALUES[field],
  })
}

export function getTopicImportAttemptDeletionBatchSize(): number {
  return readField('topic_import_attempt_batch_size')
}

export function getPartitionStatusProbeLimit(): number {
  return readField('partition_status_probe_limit')
}

export function getAIRetentionPageLimits(): DataRetentionLimits {
  return {
    batchSize: readField('ai_retention_page_size'),
    maxBatches: readField('ai_retention_max_pages_per_run'),
  }
}
