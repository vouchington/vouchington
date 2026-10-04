import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

export const friendsDispatchConfig = new DynamicConfig({
  key: 'friends-dispatch-work-config',
  fieldTypes: { batch_size: 'number', max_rows_per_provider_per_run: 'number' },
  defaultFields: { batch_size: 1000, max_rows_per_provider_per_run: 20000 },
})

export function getFriendsDispatchLimits() {
  return {
    batchSize: getBoundedPositiveIntegerField(friendsDispatchConfig, 'batch_size', {
      defaultValue: 1000,
      maxValue: 5000,
    }),
    maxRows: getBoundedPositiveIntegerField(
      friendsDispatchConfig,
      'max_rows_per_provider_per_run',
      { defaultValue: 20000, maxValue: 100000 },
    ),
  }
}
