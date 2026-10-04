import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

const defaultFields = {
  community_digest_recipient_batch_size: 250,
  reconcile_batch_size: 500,
}

/** Hard ceilings for the current runtime configuration contract. */
export const notificationsWorkMaxValues = {
  community_digest_recipient_batch_size: 2500,
  reconcile_batch_size: 5000,
}

export const notificationsWorkConfig = new DynamicConfig({
  key: 'notifications-work-config',
  fieldTypes: {
    community_digest_recipient_batch_size: 'number',
    reconcile_batch_size: 'number',
  },
  defaultFields,
})

export function getNotificationsWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(notificationsWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: notificationsWorkMaxValues[field],
  })
}
