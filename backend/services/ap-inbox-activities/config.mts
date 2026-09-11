import { DynamicConfig } from '@data-stores/valkey'

export const activityPubInboxConfig = new DynamicConfig({
  key: 'activitypub-inbox',
  fieldTypes: { async_delivery_enabled: 'boolean' },
  defaultFields: { async_delivery_enabled: false },
})

export function isAsyncActivityPubInboxDeliveryEnabled(): boolean {
  return activityPubInboxConfig.getFields().async_delivery_enabled === true
}
