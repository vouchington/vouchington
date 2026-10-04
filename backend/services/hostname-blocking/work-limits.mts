import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

const defaultFields = {
  post_related_url_delete_batch_size: 500,
}

/** Hard ceilings for the current runtime configuration contract. */
export const hostnameBlockingWorkMaxValues = {
  post_related_url_delete_batch_size: 5000,
}

export const hostnameBlockingWorkConfig = new DynamicConfig({
  key: 'hostname-blocking-work-config',
  fieldTypes: {
    post_related_url_delete_batch_size: 'number',
  },
  defaultFields,
})

export function getHostnameBlockingWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(hostnameBlockingWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: hostnameBlockingWorkMaxValues[field],
  })
}
