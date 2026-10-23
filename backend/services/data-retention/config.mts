import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export type DataRetentionConfig = {
  batch_size: number
  topic_import_attempt_batch_size: number
  max_batches_per_run: number
  copyright_minimal_case_batch_size: number
  copyright_minimal_page_size: number
  copyright_minimal_max_pages_per_case: number
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
  copyright_minimal_case_batch_size: 25,
  copyright_minimal_page_size: 50,
  copyright_minimal_max_pages_per_case: 8,
}

export const DATA_RETENTION_MAX_VALUES: DataRetentionConfig = {
  batch_size: 5_000,
  topic_import_attempt_batch_size: 250,
  max_batches_per_run: 2_000,
  copyright_minimal_case_batch_size: 100,
  copyright_minimal_page_size: 50,
  copyright_minimal_max_pages_per_case: 32,
}

export const dataRetentionConfig = new DynamicConfig({
  key: DATA_RETENTION_CONFIG_KEY,
  fieldTypes: {
    batch_size: 'number',
    max_batches_per_run: 'number',
    topic_import_attempt_batch_size: 'number',
    copyright_minimal_case_batch_size: 'number',
    copyright_minimal_page_size: 'number',
    copyright_minimal_max_pages_per_case: 'number',
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

export function getCopyrightMinimalPurgeLimits() {
  return {
    caseBatchSize: readField('copyright_minimal_case_batch_size'),
    pageSize: readField('copyright_minimal_page_size'),
    maxPagesPerCase: readField('copyright_minimal_max_pages_per_case'),
  }
}
