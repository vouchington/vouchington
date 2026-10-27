import { ACTIVITYPUB_INBOX_STORAGE_POLICY } from '@modules/activitypub-inbox-storage-policy'
import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = {
  delivery_transition_recovery_batch_size: 500,
  cleanup_batch_size: ACTIVITYPUB_INBOX_STORAGE_POLICY.cleanupBatchSize,
  cleanup_maximum_batches: ACTIVITYPUB_INBOX_STORAGE_POLICY.maximumCleanupBatches,
}

/** Hard ceilings for the current runtime configuration contract. */
export const apInboxActivitiesWorkMaxValues = {
  delivery_transition_recovery_batch_size: 5000,
  cleanup_batch_size: ACTIVITYPUB_INBOX_STORAGE_POLICY.cleanupBatchSize,
  cleanup_maximum_batches: ACTIVITYPUB_INBOX_STORAGE_POLICY.maximumCleanupBatches,
}

export const apInboxActivitiesWorkConfig = new DynamicConfig({
  key: 'ap-inbox-activities-work-config',
  fieldTypes: {
    delivery_transition_recovery_batch_size: 'number',
    cleanup_batch_size: 'number',
    cleanup_maximum_batches: 'number',
  },
  defaultFields,
})

export function getApInboxActivitiesWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(apInboxActivitiesWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: apInboxActivitiesWorkMaxValues[field],
  })
}
