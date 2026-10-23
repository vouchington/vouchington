import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = { friend_reference_connect_batch_size: 100 }
export const oauthAccountFriendWorkMaxValues = { friend_reference_connect_batch_size: 1_000 }

export const oauthAccountFriendWorkConfig = new DynamicConfig({
  key: 'oauth-account-friend-work-config',
  fieldTypes: { friend_reference_connect_batch_size: 'number' },
  defaultFields,
})

export function getOAuthFriendReferenceConnectBatchSize(): number {
  return getBoundedPositiveIntegerField(
    oauthAccountFriendWorkConfig,
    'friend_reference_connect_batch_size',
    {
      defaultValue: defaultFields.friend_reference_connect_batch_size,
      maxValue: oauthAccountFriendWorkMaxValues.friend_reference_connect_batch_size,
    },
  )
}
