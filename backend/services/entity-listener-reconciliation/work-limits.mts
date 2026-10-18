import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export const entityReconciliationConfig = new DynamicConfig({
  key: 'entity-reconciliation-work-config',
  fieldTypes: {
    batch_size: 'number',
    max_rows_per_run: 'number',
    lookback_seconds: 'number',
    replica_margin_seconds: 'number',
  },
  defaultFields: {
    batch_size: 500,
    max_rows_per_run: 10000,
    lookback_seconds: 86400,
    replica_margin_seconds: 60,
  },
})

export function getEntityReconciliationLimits() {
  return {
    batchSize: getBoundedPositiveIntegerField(entityReconciliationConfig, 'batch_size', {
      defaultValue: 500,
      maxValue: 5000,
    }),
    maxRows: getBoundedPositiveIntegerField(entityReconciliationConfig, 'max_rows_per_run', {
      defaultValue: 10000,
      maxValue: 100000,
    }),
  }
}

export function getEntityReconciliationLookback() {
  return {
    lookback:
      getBoundedPositiveIntegerField(entityReconciliationConfig, 'lookback_seconds', {
        defaultValue: 86400,
        maxValue: 31536000,
      }) * 1000,
    margin:
      getBoundedPositiveIntegerField(entityReconciliationConfig, 'replica_margin_seconds', {
        defaultValue: 60,
        maxValue: 3600,
      }) * 1000,
  }
}
