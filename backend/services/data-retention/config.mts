import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

export type DataRetentionConfig = {
  batch_size: number
  max_batches_per_run: number
}

/** The per-cleanup limits one retention run applies. Every cleanup in the run takes both. */
export type DataRetentionLimits = {
  batchSize: number
  maxBatches: number
}

export const DATA_RETENTION_CONFIG_KEY = 'data-retention-config'

export const DEFAULT_DATA_RETENTION_CONFIG: DataRetentionConfig = {
  batch_size: 500,
  max_batches_per_run: 200,
}

export const DATA_RETENTION_MAX_VALUES: DataRetentionConfig = {
  batch_size: 5_000,
  max_batches_per_run: 2_000,
}

export const dataRetentionConfig = new DynamicConfig({
  key: DATA_RETENTION_CONFIG_KEY,
  fieldTypes: { batch_size: 'number', max_batches_per_run: 'number' },
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
