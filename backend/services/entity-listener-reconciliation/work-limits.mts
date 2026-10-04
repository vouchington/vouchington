import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

export const entityReconciliationConfig = new DynamicConfig({
  key: 'entity-reconciliation-work-config',
  fieldTypes: { batch_size: 'number', max_rows_per_run: 'number' },
  defaultFields: { batch_size: 500, max_rows_per_run: 10000 },
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
