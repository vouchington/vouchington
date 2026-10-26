import { DynamicConfig } from '@data-stores/valkey'
import { getNotificationRecipientDispatchPageLimit } from '@queues/notifications/enqueues/page-limits'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = {
  community_digest_recipient_batch_size: 250,
  community_digest_window_batch_size: 25,
  reconcile_batch_size: 500,
  reconcile_recipient_page_size: 5000,
  content_visibility_page_size: 500,
  push_intent_recovery_page_size: 100,
}

/** Hard ceilings for the current runtime configuration contract. */
export const notificationsWorkMaxValues = {
  community_digest_recipient_batch_size: 2500,
  community_digest_window_batch_size: 1000,
  reconcile_batch_size: 5000,
  reconcile_recipient_page_size: 50_000,
  content_visibility_page_size: 5000,
  push_intent_recovery_page_size: 1000,
}

export const notificationsWorkConfig = new DynamicConfig({
  key: 'notifications-work-config',
  fieldTypes: {
    community_digest_recipient_batch_size: 'number',
    community_digest_window_batch_size: 'number',
    reconcile_batch_size: 'number',
    reconcile_recipient_page_size: 'number',
    content_visibility_page_size: 'number',
    push_intent_recovery_page_size: 'number',
  },
  defaultFields,
})

export function getNotificationsWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(notificationsWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: notificationsWorkMaxValues[field],
  })
}

/** Visibility pages honor the smaller configured recipient/dispatcher bound as settings change. */
export function getContentVisibilityPageLimit(): number {
  return Math.min(
    getNotificationsWorkLimit('content_visibility_page_size'),
    getNotificationsWorkLimit('reconcile_recipient_page_size'),
    getNotificationRecipientDispatchPageLimit(),
  )
}
