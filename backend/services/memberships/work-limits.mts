import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

export const membershipWorkConfig = new DynamicConfig({
  key: 'memberships-work-config',
  fieldTypes: { batch_size: 'number', max_batches_per_run: 'number' },
  defaultFields: { batch_size: 100, max_batches_per_run: 20 },
})

export function getMembershipWorkLimits() {
  return {
    batchSize: getBoundedPositiveIntegerField(membershipWorkConfig, 'batch_size', {
      defaultValue: 100,
      maxValue: 5000,
    }),
    maxBatches: getBoundedPositiveIntegerField(membershipWorkConfig, 'max_batches_per_run', {
      defaultValue: 20,
      maxValue: 2000,
    }),
  }
}
