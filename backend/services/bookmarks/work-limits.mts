import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

const defaultFields = {
  bloom_batch_size: 5000,
  bloom_lookup_batch_size: 5000,
}

/** Hard ceilings for the current runtime configuration contract. */
export const bookmarksWorkMaxValues = {
  bloom_batch_size: 50000,
  bloom_lookup_batch_size: 50000,
}

export const bookmarksWorkConfig = new DynamicConfig({
  key: 'bookmarks-work-config',
  fieldTypes: {
    bloom_batch_size: 'number',
    bloom_lookup_batch_size: 'number',
  },
  defaultFields,
})

export function getBookmarksWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(bookmarksWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: bookmarksWorkMaxValues[field],
  })
}
