import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export const FRIEND_SYNC_PROVIDERS = ['facebook', 'x', 'github'] as const
export type FriendSyncProvider = (typeof FRIEND_SYNC_PROVIDERS)[number]

/** Each provider's dispatch job has its own page size and row cap. */
export const friendsDispatchConfig = new DynamicConfig({
  key: 'friends-dispatch-work-config',
  fieldTypes: {
    facebook_batch_size: 'number',
    facebook_max_rows_per_run: 'number',
    x_batch_size: 'number',
    x_max_rows_per_run: 'number',
    github_batch_size: 'number',
    github_max_rows_per_run: 'number',
  },
  defaultFields: {
    facebook_batch_size: 1000,
    facebook_max_rows_per_run: 20000,
    x_batch_size: 1000,
    x_max_rows_per_run: 20000,
    github_batch_size: 1000,
    github_max_rows_per_run: 20000,
  },
})

export function getFriendsDispatchLimits(provider: FriendSyncProvider) {
  return {
    batchSize: getBoundedPositiveIntegerField(friendsDispatchConfig, `${provider}_batch_size`, {
      defaultValue: 1000,
      maxValue: 5000,
    }),
    maxRows: getBoundedPositiveIntegerField(friendsDispatchConfig, `${provider}_max_rows_per_run`, {
      defaultValue: 20000,
      maxValue: 100000,
    }),
  }
}
