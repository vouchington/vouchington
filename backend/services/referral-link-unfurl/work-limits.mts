import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

export const referralUnfurlDispatchConfig = new DynamicConfig({
  key: 'referral-unfurl-dispatch-work-config',
  fieldTypes: { batch_size: 'number', max_rows_per_run: 'number' },
  defaultFields: { batch_size: 1000, max_rows_per_run: 20000 },
})

export function getDispatchLimits() {
  return {
    batchSize: getBoundedPositiveIntegerField(referralUnfurlDispatchConfig, 'batch_size', {
      defaultValue: 1000,
      maxValue: 5000,
    }),
    maxRows: getBoundedPositiveIntegerField(referralUnfurlDispatchConfig, 'max_rows_per_run', {
      defaultValue: 20000,
      maxValue: 100000,
    }),
  }
}
