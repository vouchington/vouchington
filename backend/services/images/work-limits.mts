import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

const defaultFields = {
  cleanup_batch_size: 100,
  recovery_threshold_hours: 1,
  abandoned_threshold_hours: 24,
}

/** Hard ceilings for the current runtime configuration contract. */
export const imagesWorkMaxValues = {
  cleanup_batch_size: 1000,
  recovery_threshold_hours: 72,
  abandoned_threshold_hours: 240,
}

export const imagesWorkConfig = new DynamicConfig({
  key: 'images-work-config',
  fieldTypes: {
    cleanup_batch_size: 'number',
    recovery_threshold_hours: 'number',
    abandoned_threshold_hours: 'number',
  },
  defaultFields,
})

export function getImagesWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(imagesWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: imagesWorkMaxValues[field],
  })
}
