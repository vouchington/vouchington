import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

export const apiKeyExpiryConfig = new DynamicConfig({
  key: 'api-keys-work-config',
  fieldTypes: { batch_size: 'number', max_batches_per_run: 'number' },
  defaultFields: { batch_size: 100, max_batches_per_run: 20 },
})

export function getApiKeyExpiryLimits() {
  return {
    batchSize: getBoundedPositiveIntegerField(apiKeyExpiryConfig, 'batch_size', {
      defaultValue: 100,
      maxValue: 5000,
    }),
    maxBatches: getBoundedPositiveIntegerField(apiKeyExpiryConfig, 'max_batches_per_run', {
      defaultValue: 20,
      maxValue: 2000,
    }),
  }
}
