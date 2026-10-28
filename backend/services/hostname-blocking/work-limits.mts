import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = {
  relation_delete_batch_size: 500,
  hostname_scan_batch_size: 500,
  url_scan_batch_size: 500,
  penalty_enqueue_batch_size: 500,
  recovery_batch_size: 100,
}

/** Hard ceilings for the current runtime configuration contract. */
export const hostnameBlockingWorkMaxValues = {
  relation_delete_batch_size: 5000,
  hostname_scan_batch_size: 5000,
  url_scan_batch_size: 5000,
  penalty_enqueue_batch_size: 5000,
  recovery_batch_size: 1000,
}

export const hostnameBlockingWorkConfig = new DynamicConfig({
  key: 'hostname-blocking-work-config',
  fieldTypes: {
    relation_delete_batch_size: 'number',
    hostname_scan_batch_size: 'number',
    url_scan_batch_size: 'number',
    penalty_enqueue_batch_size: 'number',
    recovery_batch_size: 'number',
  },
  defaultFields,
})

export function getHostnameBlockingWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(hostnameBlockingWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: hostnameBlockingWorkMaxValues[field],
  })
}
