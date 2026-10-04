import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

export const copyrightSweepConfig = new DynamicConfig({
  key: 'copyright-notices-work-config',
  fieldTypes: { batch_size: 'number', max_batches_per_run: 'number' },
  defaultFields: { batch_size: 100, max_batches_per_run: 20 },
})

export function getCopyrightSweepLimits() {
  return {
    batchSize: getBoundedPositiveIntegerField(copyrightSweepConfig, 'batch_size', {
      defaultValue: 100,
      maxValue: 100,
    }),
    maxBatches: getBoundedPositiveIntegerField(copyrightSweepConfig, 'max_batches_per_run', {
      defaultValue: 20,
      maxValue: 2000,
    }),
  }
}
