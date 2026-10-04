import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

export const dataRequestConfig = new DynamicConfig({
  key: 'account-data-requests-work-config',
  fieldTypes: { batch_size: 'number', max_batches_per_run: 'number' },
  defaultFields: { batch_size: 500, max_batches_per_run: 20 },
})

export function getDataRequestLimits() {
  return {
    batchSize: getBoundedPositiveIntegerField(dataRequestConfig, 'batch_size', {
      defaultValue: 500,
      maxValue: 5000,
    }),
    maxBatches: getBoundedPositiveIntegerField(dataRequestConfig, 'max_batches_per_run', {
      defaultValue: 20,
      maxValue: 2000,
    }),
  }
}
